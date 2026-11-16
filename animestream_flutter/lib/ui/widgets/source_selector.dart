import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/anime_provider.dart';
import '../theme/app_theme.dart';

class SourceSelector extends StatelessWidget {
  const SourceSelector({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AnimeProvider>();
    final sources = [
      {'id': 'all', 'label': 'Todos'},
      {'id': 'AnimeAV1', 'label': 'AnimeAV1'},
      {'id': 'JKAnime', 'label': 'JKAnime'},
      {'id': 'TioAnime', 'label': 'TioAnime'},
    ];

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: sources.map((s) {
          final isSelected = provider.selectedSource == s['id'];
          return Padding(
            padding: const EdgeInsets.only(right: 8.0),
            child: ChoiceChip(
              label: Text(s['label']!),
              selected: isSelected,
              onSelected: (_) {
                provider.setSource(s['id']!);
              },
              selectedColor: AppTheme.primary,
              backgroundColor: AppTheme.surfaceLight,
              labelStyle: TextStyle(
                color: isSelected ? Colors.white : AppTheme.textSecondary,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                fontSize: 12,
              ),
              side: BorderSide.none,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
