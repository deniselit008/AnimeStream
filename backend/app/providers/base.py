"""
Base Anime Provider Interface
"""
from abc import ABC, abstractmethod
from typing import List, Optional
from backend.app.models import EpisodeItem, SearchResultItem, AnimeDetail, WatchDetail, DirectoryItem

class BaseAnimeProvider(ABC):
    name: str = "BaseProvider"
    base_url: str = ""

    @abstractmethod
    def get_latest(self) -> List[EpisodeItem]:
        """Fetch latest published episodes on the home/catalog page."""
        pass

    @abstractmethod
    def search(self, query: str) -> List[SearchResultItem]:
        """Search anime catalogue for a query."""
        pass

    @abstractmethod
    def get_anime(self, url: str) -> AnimeDetail:
        """Fetch technical sheet and complete sorted episode list of an anime."""
        pass

    @abstractmethod
    def get_watch(self, url: str) -> WatchDetail:
        """Extract available video player embeds and navigation links for an episode."""
        pass

    @abstractmethod
    def get_directory(
        self,
        genre: Optional[str] = None,
        type_filter: Optional[str] = None,
        year: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1
    ) -> List[DirectoryItem]:
        """Fetch directory/catalog items filtered by genre, type, year, status, and page."""
        pass
