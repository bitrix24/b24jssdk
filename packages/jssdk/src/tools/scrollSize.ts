/**
 * Returns scroll info
 */
const useScrollSize = (): {scrollWidth: number, scrollHeight: number} => {
	return {
		scrollWidth: Math.max(
			document.documentElement.scrollWidth,
			document.documentElement.offsetWidth
		),
		scrollHeight: Math.max(
			document.documentElement.scrollHeight,
			document.documentElement.offsetHeight
		)
	};
}

export default useScrollSize