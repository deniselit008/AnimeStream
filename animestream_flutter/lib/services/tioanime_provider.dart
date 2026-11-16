import 'dart:convert';
import 'package:html/parser.dart' as html_parser;
import '../models/anime_item.dart';
import 'http_client.dart';

class TioAnimeProvider {
  static const String name = 'TioAnime';
  static const String baseUrl = 'https://tioanime.com';

  String _formatUrl(String pathOrUrl) {
    if (pathOrUrl.isEmpty) return '';
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      return pathOrUrl;
    }
    if (!pathOrUrl.startsWith('/')) {
      pathOrUrl = '/$pathOrUrl';
    }
    return '$baseUrl$pathOrUrl';
  }

  Future<List<AnimeItem>> getLatest() async {
    try {
      final html = await AnimeHttpClient.getHtml(baseUrl);
      final document = html_parser.parse(html);
      final items = <AnimeItem>[];
      final seen = <String>{};

      for (final el in document.querySelectorAll('a[href^="/ver/"]')) {
        final href = el.attributes['href'] ?? '';
        final reg = RegExp(r'^/ver/(.+)-(\d+)$');
        final match = reg.firstMatch(href);
        if (match == null) continue;

        final slug = match.group(1)!;
        final epStr = match.group(2)!;
        final epNum = int.tryParse(epStr) ?? 1;
        final seenKey = '${slug}_$epNum';
        if (seen.contains(seenKey)) continue;
        seen.add(seenKey);

        final card = el.parent;
        final titleEl = card?.querySelector('h3, h4, h5, span.title, .title');
        String rawTitle = titleEl?.text.trim() ??
            slug.replaceAll('-', ' ').split(' ').map((w) {
              if (w.isEmpty) return '';
              return w[0].toUpperCase() + w.substring(1);
            }).join(' ');
        rawTitle = rawTitle.replaceFirst(RegExp('\\s+$epNum\$'), '').trim();

        final imgEl = card?.querySelector('img');
        String? imgSrc = imgEl?.attributes['src'];
        if (imgSrc != null && !imgSrc.startsWith('http')) {
          imgSrc = _formatUrl(imgSrc);
        }

        items.add(AnimeItem(
          title: rawTitle,
          url: _formatUrl(href),
          animeUrl: _formatUrl('/anime/$slug'),
          image: imgSrc,
          latestEpisode: epNum,
          source: name,
        ));
      }
      return items;
    } catch (_) {
      return [];
    }
  }

  Future<List<AnimeItem>> search(String query) async {
    try {
      final encoded = Uri.encodeComponent(query.trim());
      final url = '$baseUrl/directorio?q=$encoded';
      final html = await AnimeHttpClient.getHtml(url);
      final document = html_parser.parse(html);
      final results = <AnimeItem>[];
      final seen = <String>{};

      for (final el in document.querySelectorAll('a[href^="/anime/"]')) {
        final href = el.attributes['href'] ?? '';
        final slug = href.replaceAll(RegExp(r'/+$'), '').split('/').last;
        if (slug.isEmpty || seen.contains(slug) || ['directorio', 'programacion'].contains(slug)) {
          continue;
        }
        seen.add(slug);

        final card = el.parent;
        final titleEl = card?.querySelector('h3, h4, h5, span.title, .title');
        String title = titleEl?.text.trim() ??
            slug.replaceAll('-', ' ').split(' ').map((w) {
              if (w.isEmpty) return '';
              return w[0].toUpperCase() + w.substring(1);
            }).join(' ');

        final imgEl = card?.querySelector('img');
        String? imgSrc = imgEl?.attributes['src'];
        if (imgSrc != null && !imgSrc.startsWith('http')) {
          imgSrc = _formatUrl(imgSrc);
        }

        results.add(AnimeItem(
          title: title,
          url: _formatUrl(href),
          animeUrl: _formatUrl(href),
          image: imgSrc,
          source: name,
        ));
      }
      return results;
    } catch (_) {
      return [];
    }
  }

  Future<AnimeItem?> getAnimeDetails(String url) async {
    try {
      final html = await AnimeHttpClient.getHtml(url);
      final document = html_parser.parse(html);

      final titleEl = document.querySelector('h1.title, h1');
      String title = titleEl?.text.trim() ?? 'Anime';

      final imgEl = document.querySelector('.thumb img, .anime-thumbnail img');
      String? image = imgEl?.attributes['src'];
      if (image != null && !image.startsWith('http')) {
        image = _formatUrl(image);
      }

      final synEl = document.querySelector('.sinopsis, p.synopsis');
      final synopsis = synEl?.text.trim();

      final genres = <String>[];
      for (final g in document.querySelectorAll('a[href*="/genero/"]')) {
        final t = g.text.trim();
        if (t.isNotEmpty && !genres.contains(t)) genres.add(t);
      }

      // TioAnime embeds episodes inside var episodes = [...] in scripts
      final episodes = <AnimeEpisode>[];
      final slugMatch = RegExp(r'/anime/([^/]+)').firstMatch(url);
      final slug = slugMatch != null ? slugMatch.group(1)! : '';

      final scriptReg = RegExp(r'var episodes\s*=\s*(\[.*?\]);');
      final sMatch = scriptReg.firstMatch(html);
      if (sMatch != null) {
        try {
          final list = jsonDecode(sMatch.group(1)!) as List<dynamic>;
          for (final item in list) {
            final epNum = item is int ? item : int.tryParse(item.toString()) ?? 1;
            episodes.add(AnimeEpisode(
              number: epNum,
              title: 'Episodio $epNum',
              url: _formatUrl('/ver/$slug-$epNum'),
            ));
          }
        } catch (_) {}
      } else {
        for (final a in document.querySelectorAll('a[href^="/ver/$slug-"]')) {
          final href = a.attributes['href'] ?? '';
          final epMatch = RegExp('/ver/$slug-(\\d+)').firstMatch(href);
          if (epMatch != null) {
            final epNum = int.tryParse(epMatch.group(1)!) ?? 1;
            if (!episodes.any((e) => e.number == epNum)) {
              episodes.add(AnimeEpisode(
                number: epNum,
                title: 'Episodio $epNum',
                url: _formatUrl(href),
              ));
            }
          }
        }
      }

      episodes.sort((a, b) => a.number.compareTo(b.number));

      return AnimeItem(
        title: title,
        url: url,
        animeUrl: url,
        image: image,
        synopsis: synopsis,
        genres: genres,
        episodes: episodes,
        source: name,
      );
    } catch (_) {
      return null;
    }
  }

  Future<List<ServerStream>> getEpisodeServers(String url) async {
    final servers = <ServerStream>[];
    try {
      final html = await AnimeHttpClient.getHtml(url);
      // TioAnime has var videos = [["serverName", "embedUrl"], ...];
      final regVideos = RegExp(r'var videos\s*=\s*(\[\[.*?\]\]);');
      final match = regVideos.firstMatch(html);
      if (match != null) {
        try {
          final list = jsonDecode(match.group(1)!) as List<dynamic>;
          for (final entry in list) {
            if (entry is List && entry.length >= 2) {
              final sName = entry[0].toString().trim();
              final embed = entry[1].toString().trim();
              if (embed.startsWith('http')) {
                servers.add(ServerStream(
                  name: '[SUB] $sName',
                  embed: embed,
                  audio: 'SUB',
                ));
              }
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
    return servers;
  }
}
