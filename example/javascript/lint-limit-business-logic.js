const itemTotal = 3000
const shipping = 500

// 仕様: 請求額は商品合計 + 送料であるべき。
// 「-」も有効な演算なので、仕様を知らないLintは誤りと断定できない。
const billedTotal = itemTotal - shipping

console.log(`請求額: ${billedTotal}`)
