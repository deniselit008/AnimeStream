import 'package:flutter/material.dart';
import '../models/anime_item.dart';
import '../services/anime_repository.dart';

class PlayerProvider with ChangeNotifier {
  final AnimeRepository _repository = AnimeRepository();

  List<ServerStream> _servers = [];
  int _selectedServerIndex = 0;
  bool _isLoadingServers = false;
  bool _adBlockEnabled = true;
  int _blockedAdsCount = 0;

  List<ServerStream> get servers => _servers;
  int get selectedServerIndex => _selectedServerIndex;
  bool get isLoadingServers => _isLoadingServers;
  bool get adBlockEnabled => _adBlockEnabled;
  int get blockedAdsCount => _blockedAdsCount;

  ServerStream? get currentServer =>
      _servers.isNotEmpty && _selectedServerIndex < _servers.length
          ? _servers[_selectedServerIndex]
          : null;

  Future<void> loadEpisodeServers(String episodeUrl, String source) async {
    _isLoadingServers = true;
    _servers = [];
    _selectedServerIndex = 0;
    _blockedAdsCount = 0;
    notifyListeners();

    try {
      _servers = await _repository.getEpisodeServers(episodeUrl, source);
    } catch (_) {
      _servers = [];
    } finally {
      _isLoadingServers = false;
      notifyListeners();
    }
  }

  void selectServer(int index) {
    if (index >= 0 && index < _servers.length) {
      _selectedServerIndex = index;
      notifyListeners();
    }
  }

  void toggleAdBlock() {
    _adBlockEnabled = !_adBlockEnabled;
    notifyListeners();
  }

  void incrementBlockedAds() {
    _blockedAdsCount++;
    notifyListeners();
  }
}
