import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/anime_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/anime_card.dart';
import '../widgets/source_selector.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final TextEditingController _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AnimeProvider>();

    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _controller,
          autofocus: false,
          decoration: InputDecoration(
            hintText: 'Buscar anime (ej. Naruto, One Piece)...',
            hintStyle: const TextStyle(color: AppTheme.textSecondary),
            border: InputBorder.none,
            prefixIcon: const Icon(Icons.search, color: AppTheme.primary),
            suffixIcon: _controller.text.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.clear, color: AppTheme.textSecondary),
                    onPressed: () {
                      _controller.clear();
                      provider.performSearch('');
                    },
                  )
                : null,
          ),
          style: const TextStyle(color: Colors.white),
          onChanged: (val) {
            provider.performSearch(val);
          },
          onSubmitted: (val) {
            provider.performSearch(val);
          },
        ),
      ),
      body: Column(
        children: [
          const SourceSelector(),
          Expanded(
            child: provider.isLoadingSearch
                ? const Center(
                    child: CircularProgressIndicator(color: AppTheme.primary),
                  )
                : provider.searchResults.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              _controller.text.isEmpty
                                  ? Icons.search_rounded
                                  : Icons.sentiment_dissatisfied_rounded,
                              size: 64,
                              color: AppTheme.textSecondary.withOpacity(0.5),
                            ),
                            const SizedBox(height: 16),
                            Text(
                              _controller.text.isEmpty
                                  ? 'Escribe el nombre de un anime para buscar'
                                  : 'No se encontraron resultados para "${_controller.text}"',
                              style: const TextStyle(
                                color: AppTheme.textSecondary,
                                fontSize: 14,
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
                            gridDelegate:
                                SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: crossAxisCount,
                              crossAxisSpacing: 12,
                              mainAxisSpacing: 12,
                              childAspectRatio: 0.70,
                            ),
                            itemCount: provider.searchResults.length,
                            itemBuilder: (context, index) {
                              final anime = provider.searchResults[index];
                              return AnimeCard(anime: anime);
                            },
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}
