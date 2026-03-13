import { useState, useEffect } from 'react'

interface Product {
  id: string
  name: string
  price: number
  category: string
  inStock: boolean
}

interface ProductCatalogProps {
  apiBaseUrl?: string
}

export function ProductCatalog({ apiBaseUrl = '' }: ProductCatalogProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'name' | 'price'>('name')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchProducts() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/products`)
        if (!response.ok) throw new Error('Failed to load products')
        const data: Product[] = await response.json()
        setProducts(data)
        const uniqueCategories = [...new Set(data.map((p) => p.category))]
        setCategories(uniqueCategories)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    fetchProducts()
  }, [apiBaseUrl])

  useEffect(() => {
    let result = products
    if (selectedCategory !== 'all') {
      result = result.filter((p) => p.category === selectedCategory)
    }
    result = [...result].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      return a.price - b.price
    })
    setFilteredProducts(result)
  }, [products, selectedCategory, sortBy])

  if (loading) return <p>Loading products...</p>
  if (error) return <div role="alert">{error}</div>

  return (
    <div>
      <h1>Product Catalog</h1>

      <div>
        <label htmlFor="category-filter">Category</label>
        <select
          id="category-filter"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          <option value="all">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <label htmlFor="sort-by">Sort by</label>
        <select
          id="sort-by"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'price')}
        >
          <option value="name">Name</option>
          <option value="price">Price</option>
        </select>
      </div>

      {filteredProducts.length === 0 ? (
        <p>No products found</p>
      ) : (
        <ul>
          {filteredProducts.map((product) => (
            <li key={product.id}>
              <h2>{product.name}</h2>
              <p>${product.price.toFixed(2)}</p>
              <p>{product.category}</p>
              {product.inStock ? (
                <span>In Stock</span>
              ) : (
                <span>Out of Stock</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <p>{filteredProducts.length} products shown</p>
    </div>
  )
}
