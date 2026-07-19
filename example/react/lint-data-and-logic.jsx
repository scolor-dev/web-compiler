function PriceTable() {
  const rows = [
    { category: 'food', prices: [300, 450] },
    { category: 'drink', prices: [150, 200] },
  ]

  const itemTotal = 3000
  const shipping = 500
  // 仕様: 商品合計 + 送料。演算自体は有効なので、この「-」は検出できない。
  const billedTotal = itemTotal - shipping

  return (
    <section>
      <p>Total: {billedTotal}</p>
      {/* 2カテゴリあるのに先頭1カテゴリだけを使うため、Lint対象になる。 */}
      {rows.slice(0, 1).map((row) => (
        <div>
          {row.category}: {row.prices.join(', ')}
        </div>
      ))}
    </section>
  )
}

render(<PriceTable />)
