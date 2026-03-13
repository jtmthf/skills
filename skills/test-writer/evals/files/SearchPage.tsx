import { useState, useEffect } from 'react'
import { useDebounce } from './useDebounce'

interface SearchResult {
  id: string
  title: string
  description: string
}

export function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    if (!debouncedQuery) {
      setResults([])
      return
    }

    const controller = new AbortController()
    setIsLoading(true)
    setError(null)

    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error('Search failed')
        return res.json()
      })
      .then((data) => {
        setResults(data.results)
        setIsLoading(false)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError('Search failed. Please try again.')
          setIsLoading(false)
        }
      })

    return () => controller.abort()
  }, [debouncedQuery])

  return (
    <div>
      <h1>Search</h1>
      <input
        type="search"
        aria-label="Search"
        placeholder="Search..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {isLoading && <p>Searching...</p>}
      {error && <div role="alert">{error}</div>}

      {!isLoading && !error && results.length === 0 && debouncedQuery && (
        <p>No results found for "{debouncedQuery}"</p>
      )}

      {results.length > 0 && (
        <ul>
          {results.map((result) => (
            <li key={result.id}>
              <h2>{result.title}</h2>
              <p>{result.description}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
