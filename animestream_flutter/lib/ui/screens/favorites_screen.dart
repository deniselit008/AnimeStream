import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/anime_provider.dart';
import '../../models/anime_item.dart';
import '../theme/app_theme.dart';
import '../widgets/anime_card.dart';

class FavoritesScreen extends StatelessWidget {
  const FavoritesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AnimeProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mi Lista'),
      ),
      body: provider.favorites.isEmpty
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.favorite_border_rounded,
                    size: 64,
                    color: AppTheme.textSecondary.withOpacity(0.5),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'No tienes animes en tu lista',
                    style: TextStyle(
                      color: AppTheme.textSecondary,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Haz clic en el corazón de cualquier anime para guardarlo aquí.',
                    style: TextStyle(
                      color: AppTheme.textSecondary,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            )
          : LayoutBuilder(
              builder: (context, constraints) {
                int crossAxisCount = 2;
                if (constraints.maxWidth > 1200) {
                  crossAxisCount = 6;
                } else if (constraints.maxWidth > 800) {
                  crossAxisCount = 4;
                } else if (constraints.maxWidth > 500) {
                  crossAxisCount = 3;
                }

                return GridView.builder(
                  padding: const EdgeInsets.all(16),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: crossAxisCount,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 0.70,
                  ),
                  itemCount: provider.favorites.length,
                  itemBuilder: (context, index) {
                    final fav = provider.favorites[index];
                    final anime = AnimeItem(
                      title: fav.title,
                      url: fav.url,
                      animeUrl: fav.url,
                      image: fav.image,
                      source: fav.source,
                    );
                    return AnimeCard(anime: anime);
                  },
                );
              },
            ),
    );
  }
}
