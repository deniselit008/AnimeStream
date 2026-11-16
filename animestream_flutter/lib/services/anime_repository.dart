import '../models/anime_item.dart';
import 'animeav1_provider.dart';
import 'jkanime_provider.dart';
import 'tioanime_provider.dart';

class AnimeRepository {
  final AnimeAV1Provider _av1 = AnimeAV1Provider();
  final JKAnimeProvider _jk = JKAnimeProvider();
  final TioAnimeProvider _tio = TioAnimeProvider();

  Future<List<AnimeItem>> getLatestEpisodes({String source = 'all'}) async {
    final results = <AnimeItem>[];

    if (source == 'all' || source == 'AnimeAV1') {
      try {
        final list = await _av1.getLatest();
        results.addAll(list);
      } catch (_) {}
    }

    if (source == 'all' || source == 'JKAnime') {
      try {
        final list = await _jk.getLatest();
        results.addAll(list);
      } catch (_) {}
    }

    if (source == 'all' || source == 'TioAnime') {
      try {
        final list = await _tio.getLatest();
        results.addAll(list);
      } catch (_) {}
    }

    // Interleave or keep unique
    final unique = <String, AnimeItem>{};
    for (final item in results) {
      final key = '${item.title.toLowerCase()}_${item.latestEpisode ?? 1}';
      if (!unique.containsKey(key)) {
        unique[key] = item;
      }
    }

    return unique.values.toList();
  }

  Future<List<AnimeItem>> search(String query, {String source = 'all'}) async {
    final results = <AnimeItem>[];
    if (query.trim().isEmpty) return results;

    if (source == 'all' || source == 'AnimeAV1') {
      try {
        final list = await _av1.search(query);
        results.addAll(list);
      } catch (_) {}
    }

    if (source == 'all' || source == 'JKAnime') {
      try {
        final list = await _jk.search(query);
        results.addAll(list);
      } catch (_) {}
    }

    if (source == 'all' || source == 'TioAnime') {
      try {
        final list = await _tio.search(query);
        results.addAll(list);
      } catch (_) {}
    }

    final unique = <String, AnimeItem>{};
    for (final item in results) {
      final key = item.title.toLowerCase();
      if (!unique.containsKey(key)) {
        unique[key] = item;
      }
    }

    return unique.values.toList();
  }

  Future<AnimeItem?> getAnimeDetails(String url, String source) async {
    if (source == 'AnimeAV1' || url.contains('animeav1.com')) {
      return _av1.getAnimeDetails(url);
    } else if (source == 'JKAnime' || url.contains('jkanime.net')) {
      return _jk.getAnimeDetails(url);
    } else if (source == 'TioAnime' || url.contains('tioanime.com')) {
      return _tio.getAnimeDetails(url);
    }
    return null;
  }

  Future<List<ServerStream>> getEpisodeServers(String url, String source) async {
    if (source == 'AnimeAV1' || url.contains('animeav1.com')) {
      return _av1.getEpisodeServers(url);
    } else if (source == 'JKAnime' || url.contains('jkanime.net')) {
      return _jk.getEpisodeServers(url);
    } else if (source == 'TioAnime' || url.contains('tioanime.com')) {
      return _tio.getEpisodeServers(url);
    }
    return [];
  }
}
