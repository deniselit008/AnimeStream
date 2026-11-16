import 'package:html/parser.dart' as html_parser;
import '../models/anime_item.dart';
import 'http_client.dart';

class AnimeAV1Provider {
  static const String name = 'AnimeAV1';
  static const String baseUrl = 'https://animeav1.com';

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

      for (final el in document.querySelectorAll('a')) {
        final href = el.attributes['href'] ?? '';
        final reg = RegExp(r'^/media/([^/]+)/(\d+)$');
        final match = reg.firstMatch(href);
        if (match == null) continue;

        final slug = match.group(1)!;
        final epStr = match.group(2)!;
        final epNum = int.tryParse(epStr) ?? 1;
        final seenKey = '${slug}_$epNum';
        if (seen.contains(seenKey)) continue;
        seen.add(seenKey);

        final parent = el.parent;
        final imgEl = parent?.querySelector('img') ?? el.querySelector('img');
        String? imgSrc = imgEl?.attributes['src'] ?? imgEl?.attributes['data-src'];
        if (imgSrc != null && !imgSrc.startsWith('http')) {
          imgSrc = _formatUrl(imgSrc);
        }

        String rawText = el.text.replaceAll(RegExp(r'\s+'), ' ').trim();
        String title = rawText.replaceFirst(RegExp(r'^Ver\s+', caseSensitive: false), '');
        title = title.replaceFirst(RegExp('\\s+$epNum\$'), '').trim();
        if (title.isEmpty) {
          title = slug.replaceAll('-', ' ').split(' ').map((word) {
            if (word.isEmpty) return '';
            return word[0].toUpperCase() + word.substring(1);
          }).join(' ');
        }

        items.add(AnimeItem(
          title: title,
          url: _formatUrl(href),
          animeUrl: _formatUrl('/media/$slug'),
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
      final url = '$baseUrl/catalogo?search=$encoded';
      final html = await AnimeHttpClient.getHtml(url);
      final document = html_parser.parse(html);
      final results = <AnimeItem>[];
      final seen = <String>{};

      for (final el in document.querySelectorAll('a')) {
        final href = el.attributes['href'] ?? '';
        final reg = RegExp(r'^/media/([^/]+)$');
        final match = reg.firstMatch(href);
        if (match == null) continue;

        final slug = match.group(1)!;
        if (seen.contains(slug) || ['catalogo', 'horario', 'pages'].contains(slug)) {
          continue;
        }
        seen.add(slug);

        final parent = el.parent;
        final titleEl = parent?.querySelector('h3, h4, h5, .title') ?? el.querySelector('h3, h4, .title');
        String title = titleEl?.text.trim() ?? '';
        if (title.isEmpty) {
          title = el.text.replaceFirst(RegExp(r'^Ver\s+', caseSensitive: false), '').trim();
        }
        if (title.isEmpty) {
          title = slug.replaceAll('-', ' ').split(' ').map((word) {
            if (word.isEmpty) return '';
            return word[0].toUpperCase() + word.substring(1);
          }).join(' ');
        }

        final imgEl = parent?.querySelector('img') ?? el.querySelector('img');
        String? imgSrc = imgEl?.attributes['src'] ?? imgEl?.attributes['data-src'];
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

      final titleEl = document.querySelector('h1, h2, .title');
      String title = titleEl?.text.trim() ?? 'Anime';

      final imgEl = document.querySelector('.poster img, .cover img, img[src*="/covers/"], img[src*="/images/"]');
      String? image = imgEl?.attributes['src'] ?? imgEl?.attributes['data-src'];
      if (image != null && !image.startsWith('http')) {
        image = _formatUrl(image);
      }

      final synEl = document.querySelector('.synopsis, .description, p.text-sm');
      final synopsis = synEl?.text.trim();

      final genres = <String>[];
      for (final g in document.querySelectorAll('a[href*="/genero/"], a[href*="/tag/"]')) {
        final t = g.text.trim();
        if (t.isNotEmpty && !genres.contains(t)) genres.add(t);
      }

      final episodes = <AnimeEpisode>[];
      for (final a in document.querySelectorAll('a[href*="/media/"]')) {
        final href = a.attributes['href'] ?? '';
        final reg = RegExp(r'/media/[^/]+/(\d+)');
        final match = reg.firstMatch(href);
        if (match != null) {
          final epNum = int.tryParse(match.group(1)!) ?? 1;
          episodes.add(AnimeEpisode(
            number: epNum,
            title: 'Episodio $epNum',
            url: _formatUrl(href),
          ));
        }
      }

      // Sort episodes ascending
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
      final document = html_parser.parse(html);

      // Extract iframes
      for (final ifr in document.querySelectorAll('iframe')) {
        final src = ifr.attributes['src'] ?? '';
        if (src.isNotEmpty && src.startsWith('http')) {
          String sName = 'Servidor Principal';
          if (src.contains('vidhide')) sName = 'Vidhide';
          else if (src.contains('voe')) sName = 'VOE';
          else if (src.contains('streamtape')) sName = 'Streamtape';
          else if (src.contains('mixdrop')) sName = 'Mixdrop';
          else if (src.contains('mp4upload')) sName = 'MP4Upload';

          servers.add(ServerStream(
            name: '[SUB] $sName',
            embed: src,
            audio: 'SUB',
          ));
        }
      }

      // Check regex embeds in scripts
      final reg = RegExp(r"""(?:src|file|url)\s*[:=]\s*['"](https?://[^'"]+)['"]""");
      for (final match in reg.allMatches(html)) {
        final foundUrl = match.group(1)!;
        if (foundUrl.endsWith('.m3u8')) {
          servers.insert(0, ServerStream(
            name: '[SUB] HLS Reproductor',
            embed: foundUrl,
            directUrl: foundUrl,
            isDirect: true,
          ));
          break;
        }
      }
    } catch (_) {}
    return servers;
  }
}
