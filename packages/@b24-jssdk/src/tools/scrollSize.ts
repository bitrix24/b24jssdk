/**
 * Returns scroll info
 */
export default (): {scrollWidth: number, scrollHeight: number} => {
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