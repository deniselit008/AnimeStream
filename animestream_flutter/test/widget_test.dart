import 'package:flutter_test/flutter_test.dart';
import 'package:animestream_flutter/main.dart';

void main() {
  testWidgets('AnimeStreamApp smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const AnimeStreamApp());
    expect(find.byType(AnimeStreamApp), findsOneWidget);
  });
}
