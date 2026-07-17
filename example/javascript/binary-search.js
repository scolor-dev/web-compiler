function binarySearch(sortedValues, target) {
  let low = 0
  let high = sortedValues.length - 1

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const value = sortedValues[middle]

    if (value === target) return middle
    if (value < target) low = middle + 1
    else high = middle - 1
  }

  return -1
}

const values = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]
for (const target of [23, 7, 91]) {
  const index = binarySearch(values, target)
  console.log(`${target}: ${index >= 0 ? `index ${index}` : 'not found'}`)
}
