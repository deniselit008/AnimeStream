import 'dart:convert';
import 'package:http/http.dart' as http;

class AnimeHttpClient {
  static const String defaultUserAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  static Map<String, String> defaultHeaders({String? referer}) {
    final headers = <String, String>{
      'User-Agent': defaultUserAgent,
      'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Sec-Ch-Ua':
          '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    };
    if (referer != null) {
      headers['Referer'] = referer;
    }
    return headers;
  }

  static Future<String> getHtml(String url, {String? referer}) async {
    final uri = Uri.parse(url);
    final response = await http
        .get(uri, headers: defaultHeaders(referer: referer))
        .timeout(const Duration(seconds: 15));

    if (response.statusCode >= 200 && response.statusCode < 400) {
      try {
        return utf8.decode(response.bodyBytes);
      } catch (_) {
        return latin1.decode(response.bodyBytes);
      }
    }
    throw Exception('Error al conectar con $url (Código ${response.statusCode})');
  }

  static Future<dynamic> getJson(String url, {String? referer}) async {
    final uri = Uri.parse(url);
    final headers = defaultHeaders(referer: referer);
    headers['Accept'] = 'application/json, text/plain, */*';
    final response = await http
        .get(uri, headers: headers)
        .timeout(const Duration(seconds: 15));

    if (response.statusCode >= 200 && response.statusCode < 400) {
      return json.decode(utf8.decode(response.bodyBytes));
    }
    throw Exception('Error al consultar API $url (Código ${response.statusCode})');
  }
}
