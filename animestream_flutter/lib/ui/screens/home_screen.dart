import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../providers/anime_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/anime_card.dart';
import '../widgets/source_selector.dart';
import 'anime_detail_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final animeProvider = context.watch<AnimeProvider>();

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: AppTheme.primary,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 20),
            ),
            const SizedBox(width: 10),
            const Text.rich(
              TextSpan(
                text: 'Anime',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20),
                children: [
                  TextSpan(
                    text: 'Stream',
                    style: TextStyle(color: AppTheme.primary),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => animeProvider.fetchLatest(),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppTheme.primary,
        backgroundColor: AppTheme.surface,
        onRefresh: () => animeProvider.fetchLatest(),
        child: animeProvider.isLoadingLatest && animeProvider.latestEpisodes.isEmpty
            ? const Center(
                child: CircularProgressIndicator(color: AppTheme.primary),
              )
            : CustomScrollView(
                slivers: [
                  // Featured Hero Banner (if episodes available)
                  if (animeProvider.latestEpisodes.isNotEmpty)
                    SliverToBoxAdapter(
                      child: _FeaturedHero(anime: animeProvider.latestEpisodes.first),
                    ),

                  // Source Filters
                  const SliverToBoxAdapter(
                    child: SourceSelector(),
                  ),

                  // Section Header
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      child: Row(
                        children: [
                          Container(
                            width: 4,
                            height: 18,
                            decoration: BoxDecoration(
                              color: AppTheme.primary,
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                          const SizedBox(width: 8),
                          const Text(
                            'Últimos Episodios',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.textPrimary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  // Responsive Grid of Episodes
                  SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    sliver: SliverLayoutBuilder(
                      builder: (context, constraints) {
                        int crossAxisCount = 2;
                        if (constraints.crossAxisExtent > 1200) {
                          crossAxisCount = 6;
                        } else if (constraints.crossAxisExtent > 800) {
                          crossAxisCount = 4;
                        } else if (constraints.crossAxisExtent > 500) {
                          crossAxisCount = 3;
                        }

                        return SliverGrid(
                          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: crossAxisCount,
                            crossAxisSpacing: 12,
                            mainAxisSpacing: 12,
                            childAspectRatio: 0.70,
                          ),
                          delegate: SliverChildBuilderDelegate(
                            (context, index) {
                              final anime = animeProvider.latestEpisodes[index];
                              return AnimeCard(anime: anime);
                            },
                            childCount: animeProvider.latestEpisodes.length,
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class _FeaturedHero extends StatelessWidget {
  final dynamic anime;

  const _FeaturedHero({required this.anime});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AnimeProvider>();
    final isFav = provider.isFavorite(anime.title);

    return Container(
      margin: const EdgeInsets.all(16),
      height: 200,
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.cardBorder),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (anime.image != null)
            CachedNetworkImage(
              imageUrl: anime.image!,
              fit: BoxFit.cover,
            ),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.black.withOpacity(0.3),
                  Colors.black.withOpacity(0.9),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.end,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppTheme.primary,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text(
                    'ESTRENO DESTACADO',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  anime.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primary,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => AnimeDetailScreen(
                              url: anime.animeUrl ?? anime.url,
                              source: anime.source,
                              initialTitle: anime.title,
                              initialImage: anime.image,
                            ),
                          ),
                        );
                      },
                      icon: const Icon(Icons.play_arrow_rounded, size: 18),
                      label: const Text('Ver Ahora'),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Colors.white24),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      onPressed: () {
                        provider.toggleFavorite(anime);
                      },
                      icon: Icon(
                        isFav ? Icons.favorite : Icons.favorite_border,
                        color: isFav ? AppTheme.primary : Colors.white,
                        size: 18,
                      ),
                      label: Text(isFav ? 'En Mi Lista' : 'Añadir a Favoritos'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
