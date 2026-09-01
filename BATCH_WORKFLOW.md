# Batch URL + To-Buy Workflow

ShopAgent supports multiple product URLs and multiple To-Buy items in one request.

## Web
Use **Batch Intake** from the sidebar. Paste one product URL per line and one To-Buy item per line, then choose **Process everything**.

Every URL is processed independently. A verified live product page creates a Product DNA/listing and can later be compared, bought directly, or monitored. A failed URL is reported without inventing a price.

## API
`POST /api/batch/process`

```json
{
  "urls": [
    {"url": "https://example.com/product-a", "monitor": false},
    {"url": "https://example.com/product-b", "monitor": true, "target_price": 25000}
  ],
  "todo_items": ["Sony headphones", "USB-C 100W cable"]
}
```

Limits: 20 URLs and 50 To-Buy items per batch. Each URL has its own result and source URL.

## Extension
The Manifest V3 extension supports the current page as well as the same batch workflow. Set the API URL to the deployed HTTPS ShopAgent API before use.
