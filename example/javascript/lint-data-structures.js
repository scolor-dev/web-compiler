const usersById = {
  'u-1': { name: 'Aoi', scores: [80, 90] },
  'u-2': { name: 'Ren', scores: [70, 85] },
}

const rows = [
  { category: 'fruit', items: [{ name: 'apple', price: 120 }] },
  { category: 'drink', items: [{ name: 'tea', price: 150 }] },
]

// 配列の一部だけを集計しているため、Lintが確認候補を出す。
const firstOnly = rows.slice(0, 1).reduce((sum, row) => sum + row.items.length, 0)

// 存在しないキーは実行時エラーになるが、現在のLintはオブジェクトの
// 動的キーまでは追跡しない。
const selectedId = 'u-3'
console.log(usersById[selectedId].name)
console.log(firstOnly)
