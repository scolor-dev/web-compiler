function merge(left, right) {
  const result = []
  let leftIndex = 0
  let rightIndex = 0

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] <= right[rightIndex]) {
      result.push(left[leftIndex])
      leftIndex++
    } else {
      result.push(right[rightIndex])
      rightIndex++
    }
  }

  return result
    .concat(left.slice(leftIndex))
    .concat(right.slice(rightIndex))
}

function mergeSort(values) {
  if (values.length <= 1) return values

  const middle = Math.floor(values.length / 2)
  const left = mergeSort(values.slice(0, middle))
  const right = mergeSort(values.slice(middle))
  return merge(left, right)
}

const values = [38, 27, 43, 3, 9, 82, 10]
console.log('before:', values)
console.log('after: ', mergeSort(values))
