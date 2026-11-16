import 'dart:convert';
import 'package:html/parser.dart' as html_parser;
import '../models/anime_item.dart';
import 'http_client.dart';

class JKAnimeProvider {
  static const String name = 'JKAnime';
  static const String baseUrl = 'https://jkanime.net';

  Future<List<AnimeItem>> getLatest() async {
    try {
      final html = await AnimeHttpClient.getHtml('$baseUrl/');
      final document = html_parser.parse(html);
      final items = <AnimeItem>[];
      final seen = <String>{};

      for (final el in document.querySelectorAll('section.contenido a, .maxilist a, .anime__item a')) {
        final href = el.attributes['href'] ?? '';
        if (href.startsWith('http') && !href.contains('jkanime.net')) continue;

        final reg = RegExp(r'(?:https://jkanime\.net)?/([^/]+)/(\d+)/?$');
        final match = reg.firstMatch(href);
        if (match == null) continue;

        final slug = match.group(1)!;
        final epStr = match.group(2)!;
        final epNum = int.tryParse(epStr) ?? 1;
        final seenKey = '${slug}_$epNum';
        if (seen.contains(seenKey)) continue;
        seen.add(seenKey);

        final card = el.parent;
        final imgEl = card?.querySelector('.set-bg, img');
        String? imgSrc = imgEl?.attributes['data-setbg'] ?? imgEl?.attributes['src'];
        imgSrc ??= 'https://cdn.jkdesa.com/assets/images/animes/image/$slug.jpg';

        final titleEl = card?.querySelector('h5, h6, h4, h3');
        String rawTitle = titleEl?.text.trim() ?? '';
        if (rawTitle.isEmpty) {
          rawTitle = slug.replaceAll('-', ' ').split(' ').map((w) {
            if (w.isEmpty) return '';
            return w[0].toUpperCase() + w.substring(1);
          }).join(' ');
        }
        rawTitle = rawTitle.replaceFirst(RegExp('\\s*-\\s*$epNum\$'), '').trim();

        items.add(AnimeItem(
          title: rawTitle,
          url: 'https://jkanime.net/$slug/$epNum/',
          animeUrl: 'https://jkanime.net/$slug/',
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
      final url = '$baseUrl/buscar/$encoded/1/';
      final html = await AnimeHttpClient.getHtml(url);
      final document = html_parser.parse(html);
      final results = <AnimeItem>[];
      final seen = <String>{};

      for (final el in document.querySelectorAll('.anime__item a, .list-anime a, .content_widget a')) {
        final href = el.attributes['href'] ?? '';
        if (!href.startsWith('http') && !href.startsWith('/')) continue;

        final cleanHref = href.startsWith('http') ? href : '$baseUrl$href';
        final reg = RegExp(r'https://jkanime\.net/([^/]+)/?$');
        final match = reg.firstMatch(cleanHref);
        if (match == null) continue;

        final slug = match.group(1)!;
        if (['buscar', 'directorio', 'horario', 'top'].contains(slug)) continue;
        if (seen.contains(slug)) continue;
        seen.add(slug);

        final card = el.parent;
        final titleEl = card?.querySelector('h5, h4, h3, .title');
        String title = titleEl?.text.trim() ?? '';
        if (title.isEmpty) {
          title = slug.replaceAll('-', ' ').split(' ').map((w) {
            if (w.isEmpty) return '';
            return w[0].toUpperCase() + w.substring(1);
          }).join(' ');
        }

        final imgEl = card?.querySelector('.set-bg, img');
        String? imgSrc = imgEl?.attributes['data-setbg'] ?? imgEl?.attributes['src'];
        imgSrc ??= 'https://cdn.jkdesa.com/assets/images/animes/image/$slug.jpg';

        results.add(AnimeItem(
          title: title,
          url: 'https://jkanime.net/$slug/',
          animeUrl: 'https://jkanime.net/$slug/',
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

      final titleEl = document.querySelector('h1, h2, .anime__details__title h3');
      String title = titleEl?.text.trim() ?? 'Anime';

      final slugMatch = RegExp(r'https://jkanime\.net/([^/]+)/?').firstMatch(url);
      final slug = slugMatch != null ? slugMatch.group(1)! : '';

      String? image = 'https://cdn.jkdesa.com/assets/images/animes/image/$slug.jpg';
      final imgEl = document.querySelector('.anime__details__pic, .set-bg, img.poster');
      if (imgEl != null) {
        image = imgEl.attributes['data-setbg'] ?? imgEl.attributes['src'] ?? image;
      }

      final synEl = document.querySelector('.sinopsis, .anime__details__text p');
      final synopsis = synEl?.text.trim();

      final genres = <String>[];
      for (final g in document.querySelectorAll('a[href*="/genero/"]')) {
        final t = g.text.trim();
        if (t.isNotEmpty && !genres.contains(t)) genres.add(t);
      }

      final episodes = <AnimeEpisode>[];
      // Search for episode list links
      for (final a in document.querySelectorAll('a[href*="/$slug/"]')) {
        final href = a.attributes['href'] ?? '';
        final epMatch = RegExp('/$slug/(\\d+)/?').firstMatch(href);
        if (epMatch != null) {
          final epNum = int.tryParse(epMatch.group(1)!) ?? 1;
          if (!episodes.any((e) => e.number == epNum)) {
            episodes.add(AnimeEpisode(
              number: epNum,
              title: 'Episodio $epNum',
              url: 'https://jkanime.net/$slug/$epNum/',
              image: 'https://cdn.jkdesa.com/assets/images/animes/video/image_thumb/$slug-$epNum.jpg',
            ));
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
      final isDub = url.toLowerCase().contains('latino') || url.toLowerCase().contains('doblado');
      final audioType = isDub ? 'DUB' : 'SUB';
      final prefix = '[$audioType] ';

      // 1. Regex match for video embeds
      final embedReg = RegExp(r"""video\[\d+\]\s*=\s*['"]<iframe[^>]+src=['"]([^'"]+)['"]""");
      for (final match in embedReg.allMatches(html)) {
        final src = match.group(1)!;
        String sName = 'Servidor';
        if (src.contains('streamtape')) sName = 'Streamtape';
        else if (src.contains('mixdrop')) sName = 'Mixdrop';
        else if (src.contains('vidhide')) sName = 'Vidhide';
        else if (src.contains('voe')) sName = 'VOE';
        else if (src.contains('mp4upload')) sName = 'MP4Upload';

        servers.add(ServerStream(
          name: '$prefix$sName',
          embed: src,
          audio: audioType,
        ));
      }

      // 2. Regex match for remote base64 servers array
      final remoteReg = RegExp(r'var servers\s*=\s*(\[.*?\]);');
      final rMatch = remoteReg.firstMatch(html);
      if (rMatch != null) {
        try {
          final jsonList = jsonDecode(rMatch.group(1)!) as List<dynamic>;
          for (final item in jsonList) {
            final serverMap = item as Map<String, dynamic>;
            final rawName = (serverMap['server'] as String? ?? 'Mirror').trim();
            // Bug fix: Skip Mediafire if broken and clean name
            if (rawName.toLowerCase().contains('mediafire')) continue;
            final cleanName = rawName.replaceAll(RegExp(r'\s*\(mirror\)\s*', caseSensitive: false), '').trim();

            final remoteBase64 = serverMap['remote'] as String?;
            if (remoteBase64 != null && remoteBase64.isNotEmpty) {
              try {
                final decoded = utf8.decode(base64Decode(remoteBase64)).trim();
                if (decoded.startsWith('http')) {
                  servers.add(ServerStream(
                    name: '$prefix$cleanName',
                    embed: decoded,
                    audio: audioType,
                  ));
                }
              } catch (_) {}
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
    return servers;
  }
}
