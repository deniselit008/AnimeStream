class HistoryItem {
  final String animeTitle;
  final String animeUrl;
  final String? image;
  final int episodeNumber;
  final String episodeUrl;
  final int positionMs;
  final int durationMs;
  final DateTime updatedAt;

  HistoryItem({
    required this.animeTitle,
    required this.animeUrl,
    this.image,
    required this.episodeNumber,
    required this.episodeUrl,
    this.positionMs = 0,
    this.durationMs = 0,
    DateTime? updatedAt,
  }) : updatedAt = updatedAt ?? DateTime.now();

  double get progress =>
      durationMs > 0 ? (positionMs / durationMs).clamp(0.0, 1.0) : 0.0;

  Map<String, dynamic> toJson() => {
    'animeTitle': animeTitle,
    'animeUrl': animeUrl,
    'image': image,
    'episodeNumber': episodeNumber,
    'episodeUrl': episodeUrl,
    'positionMs': positionMs,
    'durationMs': durationMs,
    'updatedAt': updatedAt.toIso8601String(),
  };

  factory HistoryItem.fromJson(Map<String, dynamic> json) => HistoryItem(
    animeTitle: json['animeTitle'] as String? ?? '',
    animeUrl: json['animeUrl'] as String? ?? '',
    image: json['image'] as String?,
    episodeNumber: json['episodeNumber'] as int? ?? 1,
    episodeUrl: json['episodeUrl'] as String? ?? '',
    positionMs: json['positionMs'] as int? ?? 0,
    durationMs: json['durationMs'] as int? ?? 0,
    updatedAt: json['updatedAt'] != null
        ? DateTime.tryParse(json['updatedAt'] as String) ?? DateTime.now()
        : DateTime.now(),
  );
}

class FavoriteItem {
  final String title;
  final String url;
  final String? image;
  final String source;
  final DateTime addedAt;

  FavoriteItem({
    required this.title,
    required this.url,
    this.image,
    required this.source,
    DateTime? addedAt,
  }) : addedAt = addedAt ?? DateTime.now();

  Map<String, dynamic> toJson() => {
    'title': title,
    'url': url,
    'image': image,
    'source': source,
    'addedAt': addedAt.toIso8601String(),
  };

  factory FavoriteItem.fromJson(Map<String, dynamic> json) => FavoriteItem(
    title: json['title'] as String? ?? '',
    url: json['url'] as String? ?? '',
    image: json['image'] as String?,
    source: json['source'] as String? ?? 'AnimeStream',
    addedAt: json['addedAt'] != null
        ? DateTime.tryParse(json['addedAt'] as String) ?? DateTime.now()
        : DateTime.now(),
  );
}
