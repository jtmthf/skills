# Checkout Flow E2E Test Description

The application has the following pages and behavior:

## Pages

### `/products` — Product listing page
- Displays a grid of product cards
- Each card shows: product name, price, "Add to Cart" button
- Products load from the API on page mount
- "Add to Cart" button adds the item and shows a toast notification "Added to cart"
- Cart icon in the header shows the current item count

### `/cart` — Cart page
- Lists all items in the cart with quantities
- Each row has increment/decrement buttons and a "Remove" button
- Shows subtotal, tax (8%), and total at the bottom
- "Proceed to Checkout" button navigates to `/checkout`
- "Continue Shopping" link navigates back to `/products`

### `/checkout` — Checkout page
- Shipping address form: Name, Street, City, State, Zip
- Payment section: Card number, Expiration, CVV
- Order summary sidebar showing items, subtotal, tax, total
- "Place Order" button submits the order via POST `/api/orders`
- On success: redirects to `/orders/:id` and shows "Order confirmed!"
- On failure: shows error message inline

### Authentication
- Uses cookie-based sessions
- Login via POST `/api/auth/login` with `{ email, password }`
- The checkout page requires authentication; redirects to `/login` if not logged in

## API Endpoints

- `GET /api/products` — Returns array of `{ id, name, price, imageUrl }`
- `POST /api/cart` — Add item `{ productId, quantity }`
- `GET /api/cart` — Get cart contents
- `POST /api/orders` — Create order `{ shippingAddress, paymentMethod }`
- `POST /api/auth/login` — Login `{ email, password }`

## Test Data

- Test user: `buyer@example.com` / `testpass123`
- Seed endpoint: `POST /api/test/seed` accepts `{ scenario: "checkout" }` which creates the test user and populates products
- Cleanup endpoint: `POST /api/test/cleanup`
