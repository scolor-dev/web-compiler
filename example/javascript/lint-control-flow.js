const values = [10, 20, 30, 40, 50]
let total = 0

// 配列は5件なのに4件しか処理しない。
for (let i = 0; i < 4; i++) {
  total += values[i]
}

let ready = false
// 比較ではなく代入になっている。
if (ready = true) {
  console.log('ready')
}

let retries = 3
// whileの条件も比較ではなく代入になっている。
while (retries = 0) {
  retries--
}

const mode = 'sum'
switch (mode) {
  case 'sum':
    break
    console.log('break後なので到達できない')
  case 'average':
    console.log('average')
    break
  default:
    console.log('unknown')
}

const matrix = [
  [1, 2, 3],
  [4, 5, 6],
]

// 二次元配列は2行あるのに先頭1行しか処理しない。
for (let row = 0; row < 1; row++) {
  for (let column = 0; column < matrix[row].length; column++) {
    total += matrix[row][column]
  }
}

// breakのタイプミス。未定義の識別子として検出される。
for (let i = 0; i < values.length; i++) {
  if (values[i] === 30) brake
}

console.log(total)
