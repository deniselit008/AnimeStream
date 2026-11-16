import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/history_item.dart';

class StorageService {
  static const String _favoritesKey = 'animestream_favorites_v1';
  static const String _historyKey = 'animestream_history_v1';

  static Future<List<FavoriteItem>> getFavorites() async {
    final prefs = await SharedPreferences.getInstance();
    final jsonStr = prefs.getString(_favoritesKey);
    if (jsonStr == null || jsonStr.isEmpty) return [];
    try {
      final list = jsonDecode(jsonStr) as List<dynamic>;
      return list.map((e) => FavoriteItem.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<void> toggleFavorite(FavoriteItem item) async {
    final prefs = await SharedPreferences.getInstance();
    final favorites = await getFavorites();
    final index = favorites.indexWhere((f) => f.title.toLowerCase() == item.title.toLowerCase());

    if (index >= 0) {
      favorites.removeAt(index);
    } else {
      favorites.insert(0, item);
    }

    final jsonStr = jsonEncode(favorites.map((e) => e.toJson()).toList());
    await prefs.setString(_favoritesKey, jsonStr);
  }

  static Future<bool> isFavorite(String title) async {
    final favorites = await getFavorites();
    return favorites.any((f) => f.title.toLowerCase() == title.toLowerCase());
  }

  static Future<List<HistoryItem>> getHistory() async {
    final prefs = await SharedPreferences.getInstance();
    final jsonStr = prefs.getString(_historyKey);
    if (jsonStr == null || jsonStr.isEmpty) return [];
    try {
      final list = jsonDecode(jsonStr) as List<dynamic>;
      return list.map((e) => HistoryItem.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<void> saveHistory(HistoryItem item) async {
    final prefs = await SharedPreferences.getInstance();
    final history = await getHistory();

    history.removeWhere((h) =>
        h.animeTitle.toLowerCase() == item.animeTitle.toLowerCase() &&
        h.episodeNumber == item.episodeNumber);

    history.insert(0, item);

    // Keep max 100 history items
    if (history.length > 100) {
      history.removeRange(100, history.length);
    }

    final jsonStr = jsonEncode(history.map((e) => e.toJson()).toList());
    await prefs.setString(_historyKey, jsonStr);
  }

  static Future<void> clearHistory() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_historyKey);
  }
}
