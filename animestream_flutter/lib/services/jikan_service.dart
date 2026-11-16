import 'package:http/http.dart' as http;
import 'dart:convert';
import '../models/anime_item.dart';

class JikanService {
  static const Map<String, String> relationMap = {
    'sequel': 'Secuela',
    'prequel': 'Precuela',
    'side story': 'Historia paralela',
    'spin-off': 'Spin-off',
    'spin off': 'Spin-off',
    'alternative setting': 'Ambientación alternativa',
    'alternative version': 'Versión alternativa',
    'summary': 'Resumen / Película',
    'parent story': 'Historia principal',
    'full story': 'Historia completa',
    'character': 'Especial de personaje',
    'other': 'Especial / Otro',
  };

  static Future<List<FranchiseRelation>> getRelations(String animeTitle) async {
    final relations = <FranchiseRelation>[];
    try {
      // Clean query string
      String cleanTitle = animeTitle
          .replaceAll(RegExp(r'\s*\(TV\)', caseSensitive: false), '')
          .replaceAll(RegExp(r'\s*\(Movie\)', caseSensitive: false), '')
          .replaceAll(RegExp(r'\s*\(OVA\)', caseSensitive: false), '')
          .replaceAll(RegExp(r'\s*(?:Castellano|Latino|Audio Latino)', caseSensitive: false), '')
          .replaceAll(RegExp(r'\s*-\s*\d+$'), '')
          .trim();

      final searchUrl = Uri.parse(
          'https://api.jikan.moe/v4/anime?q=${Uri.encodeComponent(cleanTitle)}&limit=1');
      final searchRes = await http.get(searchUrl, headers: {
        'Accept': 'application/json',
        'User-Agent': 'AnimeStream/1.2.2'
      }).timeout(const Duration(seconds: 8));

      if (searchRes.statusCode == 200) {
        final searchJson = jsonDecode(searchRes.body) as Map<String, dynamic>;
        final data = searchJson['data'] as List<dynamic>?;
        if (data != null && data.isNotEmpty) {
          final malId = data[0]['mal_id'] as int?;
          if (malId != null) {
            final relUrl = Uri.parse('https://api.jikan.moe/v4/anime/$malId/relations');
            final relRes = await http.get(relUrl, headers: {
              'Accept': 'application/json',
              'User-Agent': 'AnimeStream/1.2.2'
            }).timeout(const Duration(seconds: 8));

            if (relRes.statusCode == 200) {
              final relJson = jsonDecode(relRes.body) as Map<String, dynamic>;
              final relList = relJson['data'] as List<dynamic>?;
              if (relList != null) {
                final seen = <String>{};
                for (final item in relList) {
                  final rawRel = (item['relation'] as String? ?? '').toLowerCase();
                  final spanishRel = relationMap[rawRel] ?? item['relation'] ?? 'Relacionado';
                  final entries = item['entry'] as List<dynamic>?;
                  if (entries != null) {
                    for (final e in entries) {
                      final name = e['name'] as String? ?? '';
                      final lowerName = name.toLowerCase();
                      if (seen.contains(lowerName)) continue;
                      seen.add(lowerName);

                      final eMalId = e['mal_id'] as int?;
                      final eUrl = e['url'] as String?;

                      relations.add(FranchiseRelation(
                        title: name,
                        relation: spanishRel,
                        malUrl: eUrl ?? (eMalId != null ? 'https://myanimelist.net/anime/$eMalId' : null),
                      ));
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (_) {}
    return relations;
  }
}
