import 'package:flutter/material.dart';
import '../models/anime_item.dart';
import '../models/history_item.dart';
import '../services/anime_repository.dart';
import '../services/storage_service.dart';

class AnimeProvider with ChangeNotifier {
  final AnimeRepository _repository = AnimeRepository();

  List<AnimeItem> _latestEpisodes = [];
  List<AnimeItem> _searchResults = [];
  List<FavoriteItem> _favorites = [];
  List<HistoryItem> _history = [];

  bool _isLoadingLatest = false;
  bool _isLoadingSearch = false;
  String _selectedSource = 'all'; // 'all', 'AnimeAV1', 'JKAnime', 'TioAnime'
  String _searchQuery = '';

  List<AnimeItem> get latestEpisodes => _latestEpisodes;
  List<AnimeItem> get searchResults => _searchResults;
  List<FavoriteItem> get favorites => _favorites;
  List<HistoryItem> get history => _history;

  bool get isLoadingLatest => _isLoadingLatest;
  bool get isLoadingSearch => _isLoadingSearch;
  String get selectedSource => _selectedSource;
  String get searchQuery => _searchQuery;

  AnimeProvider() {
    init();
  }

  Future<void> init() async {
    await loadFavorites();
    await loadHistory();
    await fetchLatest();
  }

  Future<void> fetchLatest() async {
    _isLoadingLatest = true;
    notifyListeners();

    try {
      _latestEpisodes = await _repository.getLatestEpisodes(source: _selectedSource);
    } catch (_) {
      _latestEpisodes = [];
    } finally {
      _isLoadingLatest = false;
      notifyListeners();
    }
  }

  Future<void> setSource(String source) async {
    if (_selectedSource != source) {
      _selectedSource = source;
      notifyListeners();
      await fetchLatest();
      if (_searchQuery.isNotEmpty) {
        await performSearch(_searchQuery);
      }
    }
  }

  Future<void> performSearch(String query) async {
    _searchQuery = query;
    if (query.trim().isEmpty) {
      _searchResults = [];
      notifyListeners();
      return;
    }

    _isLoadingSearch = true;
    notifyListeners();

    try {
      _searchResults = await _repository.search(query, source: _selectedSource);
    } catch (_) {
      _searchResults = [];
    } finally {
      _isLoadingSearch = false;
      notifyListeners();
    }
  }

  Future<void> loadFavorites() async {
    _favorites = await StorageService.getFavorites();
    notifyListeners();
  }

  Future<void> toggleFavorite(AnimeItem anime) async {
    final fav = FavoriteItem(
      title: anime.title,
      url: anime.animeUrl ?? anime.url,
      image: anime.image,
      source: anime.source,
    );
    await StorageService.toggleFavorite(fav);
    await loadFavorites();
  }

  bool isFavorite(String title) {
    return _favorites.any((f) => f.title.toLowerCase() == title.toLowerCase());
  }

  Future<void> loadHistory() async {
    _history = await StorageService.getHistory();
    notifyListeners();
  }

  Future<void> saveHistory(HistoryItem item) async {
    await StorageService.saveHistory(item);
    await loadHistory();
  }

  Future<void> clearHistory() async {
    await StorageService.clearHistory();
    await loadHistory();
  }
}
