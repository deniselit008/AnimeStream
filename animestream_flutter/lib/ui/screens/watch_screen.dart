import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:video_player/video_player.dart';
import 'package:chewie/chewie.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../models/anime_item.dart';
import '../../models/history_item.dart';
import '../../providers/player_provider.dart';
import '../../providers/anime_provider.dart';
import '../theme/app_theme.dart';

class WatchScreen extends StatefulWidget {
  final String animeTitle;
  final String episodeTitle;
  final String episodeUrl;
  final int episodeNumber;
  final String source;
  final String? thumbnail;
  final List<AnimeEpisode>? episodes;

  const WatchScreen({
    super.key,
    required this.animeTitle,
    required this.episodeTitle,
    required this.episodeUrl,
    required this.episodeNumber,
    required this.source,
    this.thumbnail,
    this.episodes,
  });

  @override
  State<WatchScreen> createState() => _WatchScreenState();
}

class _WatchScreenState extends State<WatchScreen> {
  VideoPlayerController? _videoController;
  ChewieController? _chewieController;
  WebViewController? _webViewController;
  bool _isDirectPlayer = false;
  bool _isPlayerLoading = true;
  late int _currentEpNumber;
  late String _currentEpUrl;

  @override
  void initState() {
    super.initState();
    _currentEpNumber = widget.episodeNumber;
    _currentEpUrl = widget.episodeUrl;
    _initEpisode();
  }

  Future<void> _initEpisode() async {
    final playerProvider = context.read<PlayerProvider>();
    final animeProvider = context.read<AnimeProvider>();

    // Save initial history record
    await animeProvider.saveHistory(HistoryItem(
      animeTitle: widget.animeTitle,
      animeUrl: widget.episodeUrl,
      image: widget.thumbnail,
      episodeNumber: _currentEpNumber,
      episodeUrl: _currentEpUrl,
    ));

    await playerProvider.loadEpisodeServers(_currentEpUrl, widget.source);

    if (playerProvider.servers.isNotEmpty) {
      _loadServer(playerProvider.servers[0]);
    } else {
      if (mounted) setState(() => _isPlayerLoading = false);
    }
  }

  Future<void> _loadServer(ServerStream server) async {
    _disposeControllers();
    setState(() => _isPlayerLoading = true);

    if (server.isDirect && server.directUrl != null) {
      _isDirectPlayer = true;
      try {
        _videoController = VideoPlayerController.networkUrl(Uri.parse(server.directUrl!));
        await _videoController!.initialize();

        _chewieController = ChewieController(
          videoPlayerController: _videoController!,
          autoPlay: true,
          looping: false,
          aspectRatio: 16 / 9,
          allowFullScreen: true,
          materialProgressColors: ChewieProgressColors(
            playedColor: AppTheme.primary,
            handleColor: AppTheme.primary,
            backgroundColor: AppTheme.surfaceLight,
            bufferedColor: AppTheme.textSecondary.withOpacity(0.3),
          ),
        );
      } catch (_) {
        _isDirectPlayer = false;
        _setupWebview(server.embed);
      }
    } else {
      _isDirectPlayer = false;
      _setupWebview(server.embed);
    }

    if (mounted) setState(() => _isPlayerLoading = false);
  }

  void _setupWebview(String embedUrl) {
    final playerProvider = context.read<PlayerProvider>();
    _webViewController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) {
            final url = request.url.toLowerCase();
            // AdBlock shield: block known hostile redirect domains and popups
            final blockedDomains = [
              'popads', 'adcash', 'exoclick', 'monetag', 'clickadu',
              'adsterra', 'bet365', '1xbet', 'mgid', 'juicyads',
              'zeroredirect', 'deloton', 'tsyndicate', 'vidoomy'
            ];
            for (final d in blockedDomains) {
              if (url.contains(d)) {
                playerProvider.incrementBlockedAds();
                return NavigationDecision.prevent;
              }
            }
            return NavigationDecision.navigate;
          },
          onPageFinished: (url) {
            // Inject aggressive CSS adblock and auto-click protection
            _webViewController?.runJavaScript('''
              (function() {
                var style = document.createElement('style');
                style.innerHTML = '#overlayads, .overlayads, [id*="overlayad"], [class*="overlayad"], .ad-banner, [id*="popunder"], div[style*="z-index: 2147483647"], div[style*="z-index: 9999999"] { display: none !important; pointer-events: none !important; width: 0 !important; height: 0 !important; }';
                document.head.appendChild(style);
                window.open = function() { return null; };
              })();
            ''');
          },
        ),
      )
      ..loadRequest(Uri.parse(embedUrl));
  }

  void _disposeControllers() {
    _chewieController?.dispose();
    _chewieController = null;
    _videoController?.dispose();
    _videoController = null;
    _webViewController = null;
  }

  @override
  void dispose() {
    _disposeControllers();
    super.dispose();
  }

  void _goToEpisode(int offset) {
    if (widget.episodes == null || widget.episodes!.isEmpty) return;
    final currentIndex = widget.episodes!.indexWhere((e) => e.number == _currentEpNumber);
    if (currentIndex == -1) return;

    final targetIndex = currentIndex + offset;
    if (targetIndex >= 0 && targetIndex < widget.episodes!.length) {
      final nextEp = widget.episodes![targetIndex];
      setState(() {
        _currentEpNumber = nextEp.number;
        _currentEpUrl = nextEp.url;
      });
      _initEpisode();
    }
  }

  @override
  Widget build(BuildContext context) {
    final playerProvider = context.watch<PlayerProvider>();
    final canPrev = widget.episodes != null &&
        widget.episodes!.any((e) => e.number < _currentEpNumber);
    final canNext = widget.episodes != null &&
        widget.episodes!.any((e) => e.number > _currentEpNumber);

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.animeTitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            Text(
              'Episodio $_currentEpNumber',
              style: const TextStyle(fontSize: 12, color: AppTheme.primary),
            ),
          ],
        ),
        actions: [
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: AppTheme.success.withOpacity(0.2),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppTheme.success.withOpacity(0.4)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.shield_rounded, color: AppTheme.success, size: 14),
                const SizedBox(width: 4),
                Text(
                  'AdBlock: ${playerProvider.blockedAdsCount}',
                  style: const TextStyle(
                    color: AppTheme.success,
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          // Player Container
          AspectRatio(
            aspectRatio: 16 / 9,
            child: Container(
              color: Colors.black,
              child: _isPlayerLoading
                  ? const Center(
                      child: CircularProgressIndicator(color: AppTheme.primary),
                    )
                  : _isDirectPlayer && _chewieController != null
                      ? Chewie(controller: _chewieController!)
                      : _webViewController != null
                          ? WebViewWidget(controller: _webViewController!)
                          : const Center(
                              child: Text(
                                'No se pudo cargar el reproductor',
                                style: TextStyle(color: Colors.white70),
                              ),
                            ),
            ),
          ),

          // Server and Controls Area
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Episode navigation buttons
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.surfaceLight,
                          foregroundColor: AppTheme.textPrimary,
                        ),
                        onPressed: canPrev ? () => _goToEpisode(-1) : null,
                        icon: const Icon(Icons.skip_previous_rounded),
                        label: const Text('Anterior'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.primary,
                          foregroundColor: Colors.white,
                        ),
                        onPressed: canNext ? () => _goToEpisode(1) : null,
                        icon: const Icon(Icons.skip_next_rounded),
                        label: const Text('Siguiente'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // Servers Section Header
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Servidores Disponibles',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    Text(
                      '${playerProvider.servers.length} servidores',
                      style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Server selection chips
                if (playerProvider.isLoadingServers)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.all(16.0),
                      child: CircularProgressIndicator(color: AppTheme.primary),
                    ),
                  )
                else if (playerProvider.servers.isEmpty)
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppTheme.surface,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Center(
                      child: Text(
                        'No se encontraron servidores para este episodio',
                        style: TextStyle(color: AppTheme.textSecondary),
                      ),
                    ),
                  )
                else
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: List.generate(playerProvider.servers.length, (index) {
                      final server = playerProvider.servers[index];
                      final isSelected = playerProvider.selectedServerIndex == index;

                      return ChoiceChip(
                        label: Text(server.name),
                        selected: isSelected,
                        onSelected: (_) {
                          playerProvider.selectServer(index);
                          _loadServer(server);
                        },
                        selectedColor: AppTheme.primary,
                        backgroundColor: AppTheme.surfaceLight,
                        labelStyle: TextStyle(
                          color: isSelected ? Colors.white : AppTheme.textPrimary,
                          fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                          fontSize: 12,
                        ),
                        side: BorderSide(
                          color: isSelected ? AppTheme.primary : AppTheme.cardBorder,
                        ),
                      );
                    }),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
