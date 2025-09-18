#!/usr/bin/env python3
"""
Production-Optimized Batch Keyword Research Tool
Implements all performance optimizations for maximum speed and efficiency
"""

import csv
import json
import time
import argparse
import sys
import sqlite3
import hashlib
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import os

# Import the single keyword research class
from single_keyword_research import KeywordResearcher

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class OptimizedBatchKeywordResearcher:
    def __init__(self, username: str, api_key: str, timeout: int = 30, max_workers: int = 10, cache_ttl_hours: int = 24):
        """Initialize the optimized batch researcher with all performance features"""
        self.username = username
        self.api_key = api_key
        self.timeout = timeout
        self.max_workers = max_workers
        self.cache_ttl_hours = cache_ttl_hours
        
        # Setup session with connection pooling and retry strategy
        self.session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(
            max_retries=retry_strategy,
            pool_connections=50,
            pool_maxsize=200
        )
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        
        # Initialize cache
        self.cache_db = "keyword_research_cache.db"
        self.init_cache()
        
        # Performance metrics
        self.metrics = {
            'total_requests': 0,
            'cache_hits': 0,
            'api_calls': 0,
            'start_time': None,
            'end_time': None,
            'batch_requests': 0
        }
        
        # Rate limiting
        self.last_request_time = 0
        self.min_request_interval = 0.1  # 100ms between requests
        self.rate_limit_lock = threading.Lock()

    def init_cache(self):
        """Initialize SQLite cache database"""
        try:
            conn = sqlite3.connect(self.cache_db)
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS cache (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP
                )
            ''')
            conn.commit()
            conn.close()
            logger.info(f"📦 Cache initialized: {self.cache_db}")
        except Exception as e:
            logger.error(f"❌ Failed to initialize cache: {e}")

    def get_cache_key(self, keyword: str, operation: str) -> str:
        """Generate cache key for keyword and operation"""
        return hashlib.md5(f"{keyword}_{operation}_{self.username}".encode()).hexdigest()

    def get_from_cache(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Get data from cache if not expired"""
        try:
            conn = sqlite3.connect(self.cache_db)
            cursor = conn.cursor()
            cursor.execute(
                "SELECT value FROM cache WHERE key = ? AND expires_at > ?",
                (cache_key, datetime.now())
            )
            result = cursor.fetchone()
            conn.close()
            
            if result:
                self.metrics['cache_hits'] += 1
                logger.debug(f"Cache hit for: {cache_key}")
                return json.loads(result[0])
            return None
        except Exception as e:
            logger.error(f"Cache read error: {e}")
            return None

    def save_to_cache(self, cache_key: str, data: Dict[str, Any]) -> None:
        """Save data to cache with TTL"""
        try:
            expires_at = datetime.now() + timedelta(hours=self.cache_ttl_hours)
            conn = sqlite3.connect(self.cache_db)
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)",
                (cache_key, json.dumps(data), expires_at)
            )
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Cache write error: {e}")

    def rate_limit(self):
        """Apply rate limiting between requests"""
        with self.rate_limit_lock:
            current_time = time.time()
            time_since_last = current_time - self.last_request_time
            if time_since_last < self.min_request_interval:
                time.sleep(self.min_request_interval - time_since_last)
            self.last_request_time = time.time()

    def get_cached_or_fetch(self, cache_key: str, fetch_func, *args, **kwargs):
        """Get from cache or fetch and cache the result"""
        # Try cache first
        cached_result = self.get_from_cache(cache_key)
        if cached_result:
            return cached_result
        
        # Apply rate limiting
        self.rate_limit()
        
        # Fetch the data
        result = fetch_func(*args, **kwargs)
        
        # Cache the result
        if result:
            self.save_to_cache(cache_key, result)
            self.metrics['api_calls'] += 1
        
        return result

    def read_keywords_from_csv(self, input_file: str) -> List[Dict[str, Any]]:
        """Read keywords from input CSV file"""
        keywords = []
        
        try:
            with open(input_file, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row_num, row in enumerate(reader, 1):
                    # Look for common column names for keywords
                    keyword = None
                    for col in ['keyword', 'keywords', 'seed_keyword', 'term', 'query']:
                        if col in row and row[col].strip():
                            keyword = row[col].strip()
                            break
                    
                    if keyword:
                        keywords.append({
                            'row_number': row_num,
                            'keyword': keyword,
                            'original_row': row
                        })
                    else:
                        logger.warning(f"Row {row_num}: No keyword found in columns {list(row.keys())}")
            
            logger.info(f"📖 Read {len(keywords)} keywords from {input_file}")
            return keywords
            
        except FileNotFoundError:
            logger.error(f"❌ Input file not found: {input_file}")
            return []
        except Exception as e:
            logger.error(f"❌ Error reading CSV file: {e}")
            return []

    def process_single_keyword_optimized(self, kw_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process a single keyword with all optimizations"""
        keyword = kw_data['keyword']
        row_number = kw_data['row_number']
        original_row = kw_data['original_row']
        
        logger.info(f"🔍 Processing: '{keyword}' (Row {row_number})")
        
        try:
            # Check if we have cached results for this keyword
            cache_key = self.get_cache_key(keyword, "full_research")
            cached_result = self.get_from_cache(cache_key)
            
            if cached_result:
                logger.info(f"⚡ Using cached results for '{keyword}'")
                research_results = cached_result
            else:
                # Use optimized researcher instance
                researcher = KeywordResearcher(self.username, self.api_key, self.timeout)
                
                # Research the keyword
                start_time = time.time()
                research_results = researcher.research_keyword(keyword)
                processing_time = time.time() - start_time
                
                # Cache the results
                self.save_to_cache(cache_key, research_results)
            
            # Prepare result row
            result_row = {
                'row_number': row_number,
                'seed_keyword': keyword,
                'processing_time_seconds': round(time.time() - time.time(), 2),
                'original_top_10_urls_count': len(research_results.get('original_top_10_urls', [])),
                'keywords_from_top_3_urls_count': len(research_results.get('keywords_from_top_3_urls', [])),
                'supporting_keywords_found': research_results.get('total_supporting_keywords_found', 0),
                'research_successful': True,
                'error_message': None
            }
            
            # Add supporting keywords as separate columns
            supporting_keywords = research_results.get('supporting_keywords', [])
            for j, sk in enumerate(supporting_keywords, 1):
                # Handle None values safely
                search_volume = sk.get('search_volume') or 0
                cpc = sk.get('cpc') or 0
                overlap_percentage = sk.get('overlap_percentage') or 0
                
                result_row[f'supporting_keyword_{j}'] = sk.get('keyword', '')
                result_row[f'supporting_keyword_{j}_overlap'] = f"{overlap_percentage:.1f}%"
                result_row[f'supporting_keyword_{j}_volume'] = search_volume
                result_row[f'supporting_keyword_{j}_cpc'] = f"${cpc:.2f}"
            
            # Add original row data
            for key, value in original_row.items():
                if key not in result_row:
                    result_row[f'original_{key}'] = value
            
            logger.info(f"✅ Completed '{keyword}': {len(supporting_keywords)} supporting keywords found")
            return result_row
            
        except Exception as e:
            logger.error(f"❌ Error processing '{keyword}': {e}")
            result_row = {
                'row_number': row_number,
                'seed_keyword': keyword,
                'processing_time_seconds': 0,
                'original_top_10_urls_count': 0,
                'keywords_from_top_3_urls_count': 0,
                'supporting_keywords_found': 0,
                'research_successful': False,
                'error_message': str(e)
            }
            
            # Add original row data
            for key, value in original_row.items():
                if key not in result_row:
                    result_row[f'original_{key}'] = value
            
            return result_row

    def process_keywords_parallel(self, keywords: List[Dict[str, Any]], max_keywords: Optional[int] = None) -> List[Dict[str, Any]]:
        """Process keywords in parallel with all optimizations"""
        results = []
        total_keywords = len(keywords)
        
        if max_keywords:
            keywords = keywords[:max_keywords]
            total_keywords = len(keywords)
        
        logger.info(f"🚀 Starting optimized parallel processing of {total_keywords} keywords with {self.max_workers} workers")
        self.metrics['start_time'] = time.time()
        
        # Process keywords in parallel
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            # Submit all tasks
            future_to_keyword = {
                executor.submit(self.process_single_keyword_optimized, kw_data): kw_data 
                for kw_data in keywords
            }
            
            # Collect results as they complete
            completed = 0
            for future in as_completed(future_to_keyword):
                kw_data = future_to_keyword[future]
                try:
                    result = future.result()
                    results.append(result)
                    completed += 1
                    
                    # Progress update
                    if completed % 5 == 0 or completed == total_keywords:
                        elapsed = time.time() - self.metrics['start_time']
                        rate = completed / (elapsed / 60) if elapsed > 0 else 0
                        logger.info(f"📈 Progress: {completed}/{total_keywords} completed ({rate:.1f} keywords/min)")
                        
                except Exception as e:
                    logger.error(f"❌ Error processing {kw_data['keyword']}: {e}")
                    # Add error result
                    error_result = {
                        'row_number': kw_data['row_number'],
                        'seed_keyword': kw_data['keyword'],
                        'processing_time_seconds': 0,
                        'original_top_10_urls_count': 0,
                        'keywords_from_top_3_urls_count': 0,
                        'supporting_keywords_found': 0,
                        'research_successful': False,
                        'error_message': str(e)
                    }
                    results.append(error_result)
        
        self.metrics['end_time'] = time.time()
        return results

    def save_results_to_csv(self, results: List[Dict[str, Any]], output_file: str) -> None:
        """Save results to CSV file"""
        if not results:
            logger.warning("No results to save")
            return
        
        try:
            # Get all unique column names
            all_columns = set()
            for result in results:
                all_columns.update(result.keys())
            
            # Sort columns for better readability
            column_order = [
                'row_number', 'seed_keyword', 'research_successful', 'error_message',
                'processing_time_seconds', 'original_top_10_urls_count', 
                'keywords_from_top_3_urls_count', 'supporting_keywords_found'
            ]
            
            # Add supporting keyword columns
            max_supporting = max(len([k for k in result.keys() if k.startswith('supporting_keyword_') and k.endswith('_overlap')]) for result in results)
            for i in range(1, max_supporting + 1):
                column_order.extend([
                    f'supporting_keyword_{i}', f'supporting_keyword_{i}_overlap',
                    f'supporting_keyword_{i}_volume', f'supporting_keyword_{i}_cpc'
                ])
            
            # Add remaining columns
            remaining_columns = sorted([col for col in all_columns if col not in column_order])
            column_order.extend(remaining_columns)
            
            with open(output_file, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=column_order)
                writer.writeheader()
                writer.writerows(results)
            
            logger.info(f"📊 Results saved to: {output_file}")
            
        except Exception as e:
            logger.error(f"❌ Error saving CSV file: {e}")

    def save_summary_report(self, results: List[Dict[str, Any]], output_file: str) -> None:
        """Save a comprehensive summary report as JSON"""
        successful_results = [r for r in results if r['research_successful']]
        failed_results = [r for r in results if not r['research_successful']]
        
        total_supporting_keywords = sum(r['supporting_keywords_found'] for r in successful_results)
        avg_processing_time = sum(r['processing_time_seconds'] for r in results) / len(results) if results else 0
        total_time = self.metrics['end_time'] - self.metrics['start_time'] if self.metrics['end_time'] else 0
        keywords_per_minute = len(results) / (total_time / 60) if total_time > 0 else 0
        
        summary = {
            'batch_processing_summary': {
                'total_keywords_processed': len(results),
                'successful_researches': len(successful_results),
                'failed_researches': len(failed_results),
                'total_supporting_keywords_found': total_supporting_keywords,
                'average_processing_time_seconds': round(avg_processing_time, 2),
                'total_processing_time_seconds': round(total_time, 2),
                'keywords_per_minute': round(keywords_per_minute, 2),
                'processing_timestamp': datetime.now().isoformat()
            },
            'performance_metrics': {
                'total_api_calls': self.metrics['api_calls'],
                'cache_hits': self.metrics['cache_hits'],
                'cache_hit_rate': round(self.metrics['cache_hits'] / max(self.metrics['api_calls'] + self.metrics['cache_hits'], 1) * 100, 2),
                'parallel_workers': self.max_workers,
                'cache_ttl_hours': self.cache_ttl_hours
            },
            'successful_keywords': [
                {
                    'seed_keyword': r['seed_keyword'],
                    'supporting_keywords_found': r['supporting_keywords_found'],
                    'processing_time_seconds': r['processing_time_seconds']
                } for r in successful_results
            ],
            'failed_keywords': [
                {
                    'seed_keyword': r['seed_keyword'],
                    'error_message': r['error_message']
                } for r in failed_results
            ]
        }
        
        summary_file = output_file.replace('.csv', '_summary.json')
        try:
            with open(summary_file, 'w', encoding='utf-8') as f:
                json.dump(summary, f, indent=2, ensure_ascii=False)
            logger.info(f"📄 Summary report saved to: {summary_file}")
        except Exception as e:
            logger.error(f"❌ Error saving summary report: {e}")

    def cleanup_cache(self):
        """Clean up expired cache entries"""
        try:
            conn = sqlite3.connect(self.cache_db)
            cursor = conn.cursor()
            cursor.execute("DELETE FROM cache WHERE expires_at < ?", (datetime.now(),))
            deleted = cursor.rowcount
            conn.commit()
            conn.close()
            if deleted > 0:
                logger.info(f"🧹 Cleaned up {deleted} expired cache entries")
        except Exception as e:
            logger.error(f"❌ Error cleaning cache: {e}")

def main():
    parser = argparse.ArgumentParser(description='Production-Optimized Batch Keyword Research Tool')
    parser.add_argument('input_csv', help='Input CSV file with seed keywords')
    parser.add_argument('--output', '-o', help='Output CSV file (default: auto-generated)')
    parser.add_argument('--username', required=True, help='DataForSEO username')
    parser.add_argument('--api-key', required=True, help='DataForSEO API key')
    parser.add_argument('--max-keywords', '-m', type=int, help='Maximum number of keywords to process')
    parser.add_argument('--workers', '-w', type=int, default=10, help='Number of parallel workers (default: 10)')
    parser.add_argument('--timeout', '-t', type=int, default=30, help='Request timeout in seconds (default: 30)')
    parser.add_argument('--cache-ttl', type=int, default=24, help='Cache TTL in hours (default: 24)')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose logging')
    parser.add_argument('--clean-cache', action='store_true', help='Clean expired cache entries before starting')
    
    args = parser.parse_args()
    
    # Set logging level
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Generate output filename if not provided
    if not args.output:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        args.output = f"optimized_batch_keyword_research_{timestamp}.csv"
    
    # Initialize optimized batch researcher
    batch_researcher = OptimizedBatchKeywordResearcher(
        args.username, 
        args.api_key, 
        args.timeout, 
        args.workers,
        args.cache_ttl
    )
    
    # Clean cache if requested
    if args.clean_cache:
        batch_researcher.cleanup_cache()
    
    # Read keywords from CSV
    logger.info(f"📖 Reading keywords from: {args.input_csv}")
    keywords = batch_researcher.read_keywords_from_csv(args.input_csv)
    
    if not keywords:
        logger.error("❌ No keywords found in input file")
        sys.exit(1)
    
    # Process keywords in parallel
    logger.info(f"🚀 Starting optimized parallel processing...")
    results = batch_researcher.process_keywords_parallel(keywords, args.max_keywords)
    
    # Save results
    batch_researcher.save_results_to_csv(results, args.output)
    batch_researcher.save_summary_report(results, args.output)
    
    # Print summary
    successful = len([r for r in results if r['research_successful']])
    total_supporting = sum(r['supporting_keywords_found'] for r in results)
    total_time = batch_researcher.metrics['end_time'] - batch_researcher.metrics['start_time']
    keywords_per_minute = len(results) / (total_time / 60) if total_time > 0 else 0
    cache_hit_rate = batch_researcher.metrics['cache_hits'] / max(batch_researcher.metrics['api_calls'] + batch_researcher.metrics['cache_hits'], 1) * 100
    
    logger.info(f"✅ Optimized processing complete!")
    logger.info(f"📊 Processed: {len(results)} keywords")
    logger.info(f"✅ Successful: {successful}")
    logger.info(f"❌ Failed: {len(results) - successful}")
    logger.info(f"🎯 Total supporting keywords found: {total_supporting}")
    logger.info(f"⚡ Speed: {keywords_per_minute:.1f} keywords/minute")
    logger.info(f"📦 Cache hit rate: {cache_hit_rate:.1f}%")
    logger.info(f"📁 Results saved to: {args.output}")

if __name__ == "__main__":
    main()
