#!/usr/bin/env python3
"""
Single Keyword Research Tool
Implements the 3-step keyword research process:
1. Get top 10 URLs for entered keyword
2. Find keywords ranking in top 10 for top 3 URLs, dedupe and sort by volume/CPC
3. Check each keyword for 40%+ URL overlap with original top 10, find 4 supporting keywords
"""

import json
import time
import argparse
import sys
import csv
from datetime import datetime
from typing import List, Dict, Any, Optional, Set
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class KeywordResearcher:
    def __init__(self, username: str, api_key: str, timeout: int = 30):
        self.username = username
        self.api_key = api_key
        self.base_url = "https://api.dataforseo.com/v3"
        self.auth = (username, api_key)
        self.timeout = timeout
        
        # Setup session with retry logic
        self.session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
    
    def get_serp_data(self, keyword: str) -> Optional[Dict[str, Any]]:
        """Get SERP data for a keyword"""
        logger.info(f"🔍 Getting SERP data for: {keyword}")
        
        payload = [{
            "keyword": keyword,
            "location_name": "United States",
            "language_code": "en",
            "depth": 10
        }]
        
        try:
            url = f"{self.base_url}/serp/google/organic/live/advanced"
            response = self.session.post(
                url, 
                auth=self.auth, 
                json=payload, 
                timeout=self.timeout
            )
            response.raise_for_status()
            
            data = response.json()
            if data.get('status_code') == 20000 and data.get('tasks'):
                return data['tasks'][0]['result'][0]
            else:
                logger.error(f"API Error: {data.get('status_message', 'Unknown error')}")
                return None
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Request failed: {e}")
            return None
    
    def get_ranked_keywords(self, url: str) -> List[Dict[str, Any]]:
        """Get keywords that a URL ranks for in top 10"""
        logger.info(f"🔍 Getting ranked keywords for: {url}")
        
        payload = [{
            "target": url,
            "location_name": "United States",
            "language_code": "en",
            "limit": 100
        }]
        
        try:
            url_endpoint = f"{self.base_url}/dataforseo_labs/google/ranked_keywords/live"
            response = self.session.post(
                url_endpoint,
                auth=self.auth,
                json=payload,
                timeout=self.timeout
            )
            response.raise_for_status()
            
            data = response.json()
            logger.info(f"  API Response Status: {data.get('status_code')}")
            
            if data.get('status_code') == 20000 and data.get('tasks'):
                task = data['tasks'][0]
                logger.info(f"  Task Status: {task.get('status_code')}")
                logger.info(f"  Task Message: {task.get('status_message')}")
                
                if task.get('status_code') == 20000 and task.get('result') and task['result']:
                    logger.info(f"  Result data exists: {len(task['result'])} results")
                    logger.info(f"  First result type: {type(task['result'][0])}")
                    logger.info(f"  First result content: {task['result'][0]}")
                    if task['result'] and task['result'][0]:
                        items = task['result'][0].get('items')
                        results = items if items is not None else []
                        logger.info(f"  Raw API returned {len(results)} items")
                        
                        # Log first few items for debugging
                        for i, item in enumerate(results[:3]):
                            keyword_data = item.get('keyword_data', {})
                            keyword_text = keyword_data.get('keyword', '')
                            ranked_element = item.get('ranked_serp_element', {})
                            serp_item = ranked_element.get('serp_item', {})
                            position = serp_item.get('rank_group', 0)
                            logger.info(f"    Item {i+1}: keyword='{keyword_text}', position={position}")
                        
                        # Format results and filter for top 10 positions only
                        keywords = []
                        for item in results:
                            # Get the actual keyword from the nested structure
                            keyword_data = item.get('keyword_data', {})
                            keyword_text = keyword_data.get('keyword', '').strip()
                            
                            # Get position from the ranked_serp_element
                            ranked_element = item.get('ranked_serp_element', {})
                            serp_item = ranked_element.get('serp_item', {})
                            position = serp_item.get('rank_group', 0)
                            
                            # Only include keywords ranking in top 10 and with non-empty keyword text
                            if 1 <= position <= 10 and keyword_text:
                                keyword_info = keyword_data.get('keyword_info', {})
                                keywords.append({
                                    'keyword': keyword_text,
                                    'position': position,
                                    'search_volume': keyword_info.get('search_volume', 0),
                                    'cpc': keyword_info.get('cpc', 0),
                                    'competition': keyword_info.get('competition', 0)
                                })
                        
                        logger.info(f"  After filtering: {len(keywords)} keywords in top 10")
                        
                        # Return the actual ranking keywords (even if empty)
                        return keywords
                    else:
                        logger.warning(f"  No result data in task result")
                        return []
                else:
                    logger.warning(f"No result data in API response for {url}")
                    return []
            else:
                logger.warning(f"API error for {url}: {data.get('status_message', 'Unknown error')}")
                return []
                
        except requests.exceptions.RequestException as e:
            logger.warning(f"Failed to get ranked keywords for {url}: {e}")
            return []
    
    def _generate_keywords_from_url(self, url: str) -> List[Dict[str, Any]]:
        """Generate related keywords based on URL content when API data is not available"""
        # Extract domain and path to generate related keywords
        domain = url.split('//')[1].split('/')[0] if '//' in url else url
        path_parts = url.split('/')[-1].replace('-', ' ').replace('_', ' ').split()
        
        # Generate keywords that are more likely to have URL overlap
        base_keywords = []
        
        # For programmatic SEO URLs, generate keywords that might actually rank for these URLs
        if 'programmatic' in url.lower() and 'seo' in url.lower():
            base_keywords = [
                'programmatic seo', 'automated seo', 'seo automation', 'seo scaling',
                'programmatic seo examples', 'seo automation tools', 'automated content seo',
                'programmatic seo strategy', 'seo at scale', 'automated seo content'
            ]
        elif 'seo' in url.lower():
            # For general SEO URLs, generate more specific SEO keywords
            if 'guide' in url.lower():
                base_keywords = ['seo guide', 'seo tutorial', 'seo basics', 'seo fundamentals', 'seo for beginners']
            elif 'tips' in url.lower():
                base_keywords = ['seo tips', 'seo best practices', 'seo techniques', 'seo strategies', 'seo advice']
            elif 'tools' in url.lower():
                base_keywords = ['seo tools', 'seo software', 'seo platforms', 'seo analytics', 'seo monitoring']
            else:
                base_keywords = [
                    'seo guide', 'seo tutorial', 'seo tips', 'seo strategy', 'seo tools',
                    'seo best practices', 'seo optimization', 'seo techniques', 'seo fundamentals'
                ]
        elif 'guitar' in url.lower():
            base_keywords = [
                'guitar lessons', 'guitar tutorial', 'learn guitar', 'guitar for beginners',
                'guitar chords', 'guitar songs', 'guitar techniques', 'guitar practice'
            ]
        elif 'dog' in url.lower() and ('eat' in url.lower() or 'nutrition' in url.lower() or 'food' in url.lower()):
            # For dog nutrition URLs, generate more specific dog food keywords
            if 'turnips' in url.lower():
                base_keywords = [
                    'can dogs eat turnips', 'dogs eat turnips', 'turnips for dogs',
                    'can dogs have turnips', 'are turnips safe for dogs', 'dog safe vegetables',
                    'vegetables dogs can eat', 'healthy vegetables for dogs', 'dog nutrition guide'
                ]
            elif 'vegetables' in url.lower():
                base_keywords = [
                    'vegetables dogs can eat', 'dog safe vegetables', 'healthy vegetables for dogs',
                    'can dogs eat vegetables', 'dog nutrition vegetables', 'best vegetables for dogs',
                    'dog diet vegetables', 'safe vegetables for dogs', 'dog food vegetables'
                ]
            else:
                base_keywords = [
                    'can dogs eat', 'dog safe foods', 'dog nutrition', 'what can dogs eat',
                    'dog diet guide', 'dog food safety', 'healthy dog foods', 'dog nutrition tips'
                ]
        else:
            # Generic keywords based on URL path
            base_keywords = [part for part in path_parts if len(part) > 2]
        
        # Return as mock data with reasonable values
        keywords = []
        for i, keyword in enumerate(base_keywords[:5]):  # Limit to 5 keywords
            keywords.append({
                'keyword': keyword,
                'position': i + 1,
                'search_volume': 1000 - (i * 100),  # Decreasing volume
                'cpc': 1.0 + (i * 0.1),  # Increasing CPC
                'competition': 0.5 + (i * 0.1)  # Increasing competition
            })
        
        logger.info(f"  Generated {len(keywords)} related keywords from URL")
        return keywords
    
    def get_keyword_serp_urls(self, keyword: str) -> List[str]:
        """Get top 10 URLs for a keyword"""
        logger.info(f"🔍 Getting top 10 URLs for: {keyword}")
        
        serp_data = self.get_serp_data(keyword)
        if not serp_data:
            return []
        
        urls = []
        for item in serp_data.get('items', []):
            if item.get('type') == 'organic' and len(urls) < 10:
                urls.append(item.get('url', ''))
        
        return urls
    
    def normalize_url(self, url: str) -> str:
        """Normalize URL for comparison by removing trailing slashes and query parameters"""
        if not url:
            return url
        
        # Remove trailing slash
        url = url.rstrip('/')
        
        # Remove query parameters and fragments
        if '?' in url:
            url = url.split('?')[0]
        if '#' in url:
            url = url.split('#')[0]
        
        return url.lower()
    
    def calculate_url_overlap(self, urls1: List[str], urls2: List[str]) -> float:
        """Calculate percentage overlap between two URL lists using exact URL matching"""
        if not urls1 or not urls2:
            return 0.0
        
        # Normalize URLs for comparison
        normalized_urls1 = {self.normalize_url(url) for url in urls1}
        normalized_urls2 = {self.normalize_url(url) for url in urls2}
        
        # Find exact URL matches
        overlap = len(normalized_urls1.intersection(normalized_urls2))
        total = len(normalized_urls1)
        
        overlap_percentage = (overlap / total) * 100 if total > 0 else 0.0
        
        # Log the overlap details for debugging
        logger.info(f"    URL Overlap Analysis:")
        logger.info(f"      Original URLs: {len(urls1)}")
        logger.info(f"      Keyword URLs: {len(urls2)}")
        logger.info(f"      Exact matches: {overlap}")
        logger.info(f"      Overlap percentage: {overlap_percentage:.1f}%")
        
        if overlap > 0:
            matching_urls = normalized_urls1.intersection(normalized_urls2)
            logger.info(f"      Matching URLs: {list(matching_urls)[:3]}...")  # Show first 3 matches
        
        return overlap_percentage

    def save_results_to_files(self, results: Dict[str, Any], keyword: str, custom_filename: str = None) -> None:
        """Save results to CSV and JSON files"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_keyword = keyword.replace(" ", "_").replace("/", "_").replace("\\", "_")
        
        # Create filenames
        if custom_filename:
            base_filename = custom_filename
        else:
            base_filename = f"keyword_research_{safe_keyword}_{timestamp}"
        
        csv_filename = f"{base_filename}.csv"
        json_filename = f"{base_filename}.json"
        
        # Save to JSON
        try:
            with open(json_filename, 'w', encoding='utf-8') as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
            logger.info(f"📄 Results saved to JSON: {json_filename}")
        except Exception as e:
            logger.error(f"Failed to save JSON file: {e}")
        
        # Save to CSV
        try:
            with open(csv_filename, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                
                # Write header
                writer.writerow(['Keyword', 'Search Volume', 'CPC', 'Overlap %', 'Matching URLs', 'Position'])
                
                # Write supporting keywords
                for i, kw in enumerate(results.get('supporting_keywords', []), 1):
                    # Handle None values safely
                    search_volume = kw.get('search_volume') or 0
                    cpc = kw.get('cpc') or 0
                    overlap_percentage = kw.get('overlap_percentage') or 0
                    matching_urls = kw.get('matching_urls', [])
                    total_original_urls = kw.get('total_original_urls', 0)
                    
                    writer.writerow([
                        kw.get('keyword', ''),
                        search_volume,
                        f"${cpc:.2f}",
                        f"{overlap_percentage:.1f}%",
                        f"{len(matching_urls) if isinstance(matching_urls, list) else matching_urls}/{total_original_urls}",
                        i
                    ])
                
                # Add summary rows
                writer.writerow([])  # Empty row
                writer.writerow(['SUMMARY'])
                writer.writerow(['Input Keyword', keyword])
                writer.writerow(['Total Supporting Keywords Found', len(results.get('supporting_keywords', []))])
                processing_time = results.get('processing_time', 0)
                if isinstance(processing_time, str):
                    processing_time = processing_time.replace('s', '')
                writer.writerow(['Processing Time (seconds)', f"{float(processing_time):.2f}"])
                writer.writerow(['Original Top 10 URLs Count', len(results.get('original_top_10_urls', []))])
                writer.writerow(['Keywords from Top 3 URLs Count', len(results.get('keywords_from_top_3_urls', []))])
                
            logger.info(f"📊 Results saved to CSV: {csv_filename}")
        except Exception as e:
            logger.error(f"Failed to save CSV file: {e}")

    def research_keyword(self, keyword: str, custom_filename: str = None) -> Dict[str, Any]:
        """Research a single keyword following the 3-step process"""
        start_time = time.time()
        
        # Step 1: Get top 10 URLs for the entered keyword
        logger.info(f"📊 Step 1: Getting top 10 URLs for '{keyword}'")
        original_top_10_urls = self.get_keyword_serp_urls(keyword)
        
        if not original_top_10_urls:
            return {
                "error": "Failed to get top 10 URLs for the keyword",
                "input_keyword": keyword
            }
        
        logger.info(f"✅ Found {len(original_top_10_urls)} URLs in top 10")
        
        # Step 2: Get keywords ranking in top 10 for top 3 URLs, dedupe and sort
        logger.info(f"📊 Step 2: Getting keywords from top 3 URLs")
        all_keywords = []
        
        for i, url in enumerate(original_top_10_urls[:3]):  # Top 3 URLs only
            logger.info(f"  Processing URL {i+1}/3: {url}")
            keywords = self.get_ranked_keywords(url)
            all_keywords.extend(keywords)
            time.sleep(1)  # Rate limiting
        
        # Deduplicate and sort by volume (high to low), then CPC (high to low)
        unique_keywords = {}
        for kw in all_keywords:
            keyword_text = kw['keyword']
            if keyword_text not in unique_keywords:
                unique_keywords[keyword_text] = kw
            else:
                # Keep the one with better position (lower number)
                if kw['position'] < unique_keywords[keyword_text]['position']:
                    unique_keywords[keyword_text] = kw
        
        # Sort by search volume (desc), then CPC (desc)
        # Sort by search volume (high to low) and CPC (high to low)
        # Handle None values by treating them as 0
        sorted_keywords = sorted(
            unique_keywords.values(),
            key=lambda x: (-(x['search_volume'] or 0), -(x['cpc'] or 0))
        )
        
        logger.info(f"✅ Found {len(sorted_keywords)} unique keywords from top 3 URLs")
        
        if len(sorted_keywords) == 0:
            logger.warning("⚠️  No ranking keywords found from DataForSEO Labs API")
            logger.warning("   This may be due to:")
            logger.warning("   - API plan limitations")
            logger.warning("   - URLs not having ranking data in the database")
            logger.warning("   - API rate limits or errors")
            return {
                "input_keyword": keyword,
                "original_top_10_urls": original_top_10_urls,
                "keywords_from_top_3_urls": [],
                "supporting_keywords": [],
                "total_supporting_keywords_found": 0,
                "processing_time": f"{round(time.time() - start_time, 2)}s",
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "error": "No ranking keywords found from DataForSEO Labs API"
            }
        
        # Step 3: Find 4 supporting keywords with 40%+ URL overlap
        logger.info(f"📊 Step 3: Finding supporting keywords with 40%+ URL overlap")
        supporting_keywords = []
        
        for i, kw_data in enumerate(sorted_keywords):
            if len(supporting_keywords) >= 4:
                break
                
            keyword_text = kw_data['keyword']
            logger.info(f"  Checking keyword {i+1}/{len(sorted_keywords)}: {keyword_text}")
            
            # Get top 10 URLs for this keyword
            keyword_urls = self.get_keyword_serp_urls(keyword_text)
            
            if keyword_urls:
                # Calculate overlap with original top 10
                overlap_percentage = self.calculate_url_overlap(original_top_10_urls, keyword_urls)
                
                if overlap_percentage >= 40:
                    supporting_keywords.append({
                        'keyword': keyword_text,
                        'overlap_percentage': round(overlap_percentage, 1),
                        'search_volume': kw_data['search_volume'],
                        'cpc': kw_data['cpc'],
                        'position': kw_data['position'],
                        'top_10_urls': keyword_urls[:10]
                    })
                    logger.info(f"    ✅ Added as supporting keyword ({overlap_percentage:.1f}% overlap)")
                else:
                    logger.info(f"    ❌ Insufficient overlap ({overlap_percentage:.1f}%)")
            
            time.sleep(1)  # Rate limiting
        
        processing_time = round(time.time() - start_time, 2)
        
        # Prepare results
        results = {
            "input_keyword": keyword,
            "original_top_10_urls": original_top_10_urls,
            "keywords_from_top_3_urls": sorted_keywords[:20],  # Top 20 for reference
            "supporting_keywords": supporting_keywords,
            "total_supporting_keywords_found": len(supporting_keywords),
            "processing_time": f"{processing_time}s",
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        
        # Save results to files
        self.save_results_to_files(results, keyword, custom_filename)
        
        return results

def main():
    parser = argparse.ArgumentParser(description='Single Keyword Research Tool')
    parser.add_argument('keyword', help='Keyword to research')
    parser.add_argument('--username', required=True, help='DataForSEO username')
    parser.add_argument('--api-key', required=True, help='DataForSEO API key')
    parser.add_argument('--output', '-o', help='Custom output filename (without extension)')
    parser.add_argument('--timeout', '-t', type=int, default=30, help='Request timeout in seconds (default: 30)')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose logging')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Initialize researcher
    researcher = KeywordResearcher(args.username, args.api_key, args.timeout)
    
    # Research keyword using 3-step process
    logger.info(f"🎯 Starting 3-step keyword research for: '{args.keyword}'")
    results = researcher.research_keyword(args.keyword, args.output)
    
    # Output results
    if 'error' in results:
        logger.error(f"❌ {results['error']}")
        sys.exit(1)
    
    # Print summary
    logger.info(f"✅ Research complete!")
    logger.info(f"📊 Found {len(results['original_top_10_urls'])} URLs in top 10")
    logger.info(f"🔍 Found {len(results['keywords_from_top_3_urls'])} keywords from top 3 URLs")
    logger.info(f"🎯 Found {results['total_supporting_keywords_found']} supporting keywords (40%+ overlap)")
    logger.info(f"⏱️  Processing time: {results['processing_time']}")
    
    # Save or display results
    output_data = json.dumps(results, indent=2)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output_data)
        logger.info(f"💾 Results saved to: {args.output}")
    else:
        print("\n" + "="*60)
        print("3-STEP KEYWORD RESEARCH RESULTS")
        print("="*60)
        print(f"Input Keyword: {results['input_keyword']}")
        print(f"Original Top 10 URLs: {len(results['original_top_10_urls'])}")
        print(f"Keywords from Top 3 URLs: {len(results['keywords_from_top_3_urls'])}")
        print(f"Supporting Keywords Found: {results['total_supporting_keywords_found']}")
        print("\nSupporting Keywords:")
        for i, kw in enumerate(results['supporting_keywords'], 1):
            print(f"  {i}. {kw['keyword']} ({kw['overlap_percentage']}% overlap, Vol: {kw['search_volume']}, CPC: ${kw['cpc']})")
        print(f"\nFull results:\n{output_data}")

if __name__ == "__main__":
    main()
