function splitIntoChunks<T>(array: T[], chunkSize: number): T[][] {
  return array.reduce<T[][]>((accumulator, currentValue, currentIndex) => {
    if (currentIndex % chunkSize === 0) {
      accumulator.push(array.slice(currentIndex, currentIndex + chunkSize))
    }
    return accumulator
  }, [])
}

export default splitIntoChunks
