"""Each source is ranked only by its own number. Run: python -m unittest test_rank"""

from __future__ import annotations

import unittest

from rank import rank_google, rank_wikipedia


class WikipediaRankTests(unittest.TestCase):
    def test_orders_by_views_and_drops_dot_tld(self):
        current = {
            "sources": {
                "wikipedia_pageviews": {
                    "items": [
                        {"title": "Smaller", "views": 80_000},
                        {"title": ".xyz", "views": 900_000},
                        {"title": "Bigger", "views": 200_000},
                    ],
                },
            },
        }
        ranked = rank_wikipedia(current)
        self.assertEqual([row["title"] for row in ranked], ["Bigger", "Smaller"])
        self.assertEqual([row["rank"] for row in ranked], [1, 2])


class GoogleRankTests(unittest.TestCase):
    def test_keeps_google_order_and_drops_free_bet_spam(self):
        current = {
            "sources": {
                "google_trends": {
                    "items": [
                        {"term": "bet365 free bet", "approx_traffic": "100+", "rank": 1},
                        {"term": "First", "approx_traffic": "200+", "rank": 2},
                        {"term": "Second", "approx_traffic": "5000+", "rank": 3},
                    ],
                },
            },
        }
        ranked = rank_google(current)
        self.assertEqual([row["term"] for row in ranked], ["First", "Second"])


if __name__ == "__main__":
    unittest.main()
