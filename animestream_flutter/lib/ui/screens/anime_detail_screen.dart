import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/anime_item.dart';
import '../../providers/anime_provider.dart';
import '../../services/anime_repository.dart';
import '../../services/jikan_service.dart';
import '../theme/app_theme.dart';
import 'watch_screen.dart';

class AnimeDetailScreen extends StatefulWidget {
  final String url;
  final String source;
  final String? initialTitle;
  final String? initialImage;

  const AnimeDetailScreen({
    super.key,
    required this.url,
    required this.source,
    this.initialTitle,
    this.initialImage,
  });

  @override
  State<AnimeDetailScreen> createState() => _AnimeDetailScreenState();
}

class _AnimeDetailScreenState extends State<AnimeDetailScreen> {
  final AnimeRepository _repository = AnimeRepository();
  AnimeItem? _anime;
  List<FranchiseRelation> _relations = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final data = await _repository.getAnimeDetails(widget.url, widget.source);
      if (mounted) {
        setState(() {
          _anime = data;
          _isLoading = false;
        });
        if (data != null) {
          _loadRelations(data.title);
        }
      }
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _loadRelations(String title) async {
    try {
      final rels = await JikanService.getRelations(title);
      if (mounted) {
        setState(() {
          _relations = rels;
        });
      }
    } catch (_) {}
  }

  Future<void> _openExternalUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AnimeProvider>();
    final title = _anime?.title ?? widget.initialTitle ?? 'Anime';
    final image = _anime?.image ?? widget.initialImage;
    final isFav = provider.isFavorite(title);

    return Scaffold(
      body: _isLoading && _anime == null
          ? const Center(child: CircularProgressIndicator(color: AppTheme.primary))
          : CustomScrollView(
              slivers: [
                SliverAppBar(
                  expandedHeight: 280,
                  pinned: true,
                  flexibleSpace: FlexibleSpaceBar(
                    title: Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    background: Stack(
                      fit: StackFit.expand,
                      children: [
                        if (image != null)
                          CachedNetworkImage(
                            imageUrl: image,
                            fit: BoxFit.cover,
                          ),
                        DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [
                                Colors.transparent,
                                AppTheme.background.withOpacity(0.95),
                              ],
                              stops: const [0.3, 1.0],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  actions: [
                    IconButton(
                      icon: Icon(
                        isFav ? Icons.favorite : Icons.favorite_border,
                        color: isFav ? AppTheme.primary : Colors.white,
                      ),
                      onPressed: () {
                        if (_anime != null) {
                          provider.toggleFavorite(_anime!);
                        } else {
                          provider.toggleFavorite(AnimeItem(
                            title: title,
                            url: widget.url,
                            animeUrl: widget.url,
                            image: image,
                            source: widget.source,
                          ));
                        }
                      },
                    ),
                  ],
                ),

                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // External source link button
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            ElevatedButton.icon(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.surfaceLight,
                                foregroundColor: AppTheme.textPrimary,
                                side: const BorderSide(color: AppTheme.cardBorder),
                              ),
                              onPressed: () => _openExternalUrl(widget.url),
                              icon: const Icon(Icons.open_in_new_rounded, size: 16),
                              label: Text('Ver en ${widget.source}'),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),

                        // Genres
                        if (_anime?.genres.isNotEmpty ?? false) ...[
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: _anime!.genres
                                .map((g) => Chip(
                                      label: Text(g),
                                      padding: EdgeInsets.zero,
                                    ))
                                .toList(),
                          ),
                          const SizedBox(height: 16),
                        ],

                        // Synopsis
                        if (_anime?.synopsis != null && _anime!.synopsis!.isNotEmpty) ...[
                          const Text(
                            'Sinopsis',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _anime!.synopsis!,
                            style: const TextStyle(
                              color: AppTheme.textSecondary,
                              height: 1.5,
                              fontSize: 14,
                            ),
                          ),
                          const SizedBox(height: 24),
                        ],

                        // Franchise Relations (Prequels & Sequels)
                        if (_relations.isNotEmpty) ...[
                          const Text(
                            'Franquicia y Relacionados',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 10),
                          SizedBox(
                            height: 110,
                            child: ListView.separated(
                              scrollDirection: Axis.horizontal,
                              itemCount: _relations.length,
                              separatorBuilder: (_, __) => const SizedBox(width: 10),
                              itemBuilder: (context, index) {
                                final rel = _relations[index];
                                return InkWell(
                                  onTap: () {
                                    provider.performSearch(rel.title);
                                  },
                                  borderRadius: BorderRadius.circular(10),
                                  child: Container(
                                    width: 180,
                                    padding: const EdgeInsets.all(10),
                                    decoration: BoxDecoration(
                                      color: AppTheme.surface,
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(color: AppTheme.cardBorder),
                                    ),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                          decoration: BoxDecoration(
                                            color: AppTheme.secondary.withOpacity(0.3),
                                            borderRadius: BorderRadius.circular(4),
                                          ),
                                          child: Text(
                                            rel.relation,
                                            style: const TextStyle(
                                              color: AppTheme.secondary,
                                              fontSize: 10,
                                              fontWeight: FontWeight.bold,
                                            ),
                                          ),
                                        ),
                                        const SizedBox(height: 6),
                                        Text(
                                          rel.title,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            color: AppTheme.textPrimary,
                                            fontSize: 12,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
                          const SizedBox(height: 24),
                        ],

                        // Episode List Header
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              'Episodios',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.textPrimary,
                              ),
                            ),
                            Text(
                              '${_anime?.episodes.length ?? 0} episodios',
                              style: const TextStyle(
                                color: AppTheme.textSecondary,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                      ],
                    ),
                  ),
                ),

                // Episode Grid
                if (_anime != null && _anime!.episodes.isNotEmpty)
                  SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    sliver: SliverGrid(
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 4,
                        mainAxisSpacing: 8,
                        crossAxisSpacing: 8,
                        childAspectRatio: 2.2,
                      ),
                      delegate: SliverChildBuilderDelegate(
                        (context, index) {
                          final ep = _anime!.episodes[index];
                          return ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.surfaceLight,
                              foregroundColor: AppTheme.textPrimary,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                              padding: EdgeInsets.zero,
                            ),
                            onPressed: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => WatchScreen(
                                    animeTitle: _anime!.title,
                                    episodeTitle: ep.title,
                                    episodeUrl: ep.url,
                                    episodeNumber: ep.number,
                                    source: widget.source,
                                    thumbnail: ep.image ?? _anime!.image,
                                    episodes: _anime!.episodes,
                                  ),
                                ),
                              );
                            },
                            child: Text(
                              '${ep.number}',
                              style: const TextStyle(fontWeight: FontWeight.bold),
                            ),
                          );
                        },
                        childCount: _anime!.episodes.length,
                      ),
                    ),
                  )
                else if (!_isLoading)
                  const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.all(24.0),
                      child: Center(
                        child: Text(
                          'No se encontraron episodios disponibles',
                          style: TextStyle(color: AppTheme.textSecondary),
                        ),
                      ),
                    ),
                  ),

                const SliverToBoxAdapter(child: SizedBox(height: 40)),
              ],
            ),
    );
  }
}
