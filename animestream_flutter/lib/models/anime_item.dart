class AnimeEpisode {
  final int number;
  final String title;
  final String url;
  final String? image;

  AnimeEpisode({
    required this.number,
    required this.title,
    required this.url,
    this.image,
  });

  Map<String, dynamic> toJson() => {
    'number': number,
    'title': title,
    'url': url,
    'image': image,
  };

  factory AnimeEpisode.fromJson(Map<String, dynamic> json) => AnimeEpisode(
    number: json['number'] as int? ?? 1,
    title: json['title'] as String? ?? 'Episodio',
    url: json['url'] as String? ?? '',
    image: json['image'] as String?,
  );
}

class ServerStream {
  final String name;
  final String embed;
  final String audio;
  final String? directUrl;
  final bool isDirect;

  ServerStream({
    required this.name,
    required this.embed,
    this.audio = 'SUB',
    this.directUrl,
    this.isDirect = false,
  });

  Map<String, dynamic> toJson() => {
    'name': name,
    'embed': embed,
    'audio': audio,
    'directUrl': directUrl,
    'isDirect': isDirect,
  };

  factory ServerStream.fromJson(Map<String, dynamic> json) => ServerStream(
    name: json['name'] as String? ?? 'Servidor',
    embed: json['embed'] as String? ?? '',
    audio: json['audio'] as String? ?? 'SUB',
    directUrl: json['directUrl'] as String?,
    isDirect: json['isDirect'] as bool? ?? false,
  );
}

class AnimeItem {
  final String title;
  final String url;
  final String? image;
  final String? banner;
  final String? synopsis;
  final String? rating;
  final String? type;
  final String? status;
  final List<String> genres;
  final List<AnimeEpisode> episodes;
  final String source;
  final int? latestEpisode;
  final String? animeUrl;

  AnimeItem({
    required this.title,
    required this.url,
    this.image,
    this.banner,
    this.synopsis,
    this.rating,
    this.type,
    this.status,
    this.genres = const [],
    this.episodes = const [],
    required this.source,
    this.latestEpisode,
    this.animeUrl,
  });

  Map<String, dynamic> toJson() => {
    'title': title,
    'url': url,
    'image': image,
    'banner': banner,
    'synopsis': synopsis,
    'rating': rating,
    'type': type,
    'status': status,
    'genres': genres,
    'episodes': episodes.map((e) => e.toJson()).toList(),
    'source': source,
    'latestEpisode': latestEpisode,
    'animeUrl': animeUrl,
  };

  factory AnimeItem.fromJson(Map<String, dynamic> json) => AnimeItem(
    title: json['title'] as String? ?? '',
    url: json['url'] as String? ?? '',
    image: json['image'] as String?,
    banner: json['banner'] as String?,
    synopsis: json['synopsis'] as String?,
    rating: json['rating'] as String?,
    type: json['type'] as String?,
    status: json['status'] as String?,
    genres: (json['genres'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? [],
    episodes: (json['episodes'] as List<dynamic>?)
            ?.map((e) => AnimeEpisode.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [],
    source: json['source'] as String? ?? 'AnimeStream',
    latestEpisode: json['latestEpisode'] as int?,
    animeUrl: json['animeUrl'] as String?,
  );
}

class FranchiseRelation {
  final String title;
  final String relation;
  final String? malUrl;
  final String? image;

  FranchiseRelation({
    required this.title,
    required this.relation,
    this.malUrl,
    this.image,
  });

  Map<String, dynamic> toJson() => {
    'title': title,
    'relation': relation,
    'malUrl': malUrl,
    'image': image,
  };

  factory FranchiseRelation.fromJson(Map<String, dynamic> json) =>
      FranchiseRelation(
        title: json['title'] as String? ?? '',
        relation: json['relation'] as String? ?? 'Relacionado',
        malUrl: json['malUrl'] as String?,
        image: json['image'] as String?,
      );
}
