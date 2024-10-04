export function useDateFormatter()
{
	const formatDate = (date: Date, template: string): string => {
		const padZero = (num: number): string => num.toString().padStart(2, '0');
		
		const year = date.getFullYear();
		const month = padZero(date.getMonth() + 1); // Месяцы начинаются с 0
		const day = padZero(date.getDate());
		const hours = padZero(date.getHours());
		const minutes = padZero(date.getMinutes());
		const seconds = padZero(date.getSeconds());
		
		return template
			.replace('Y', year.toString())
			.replace('m', month)
			.replace('d', day)
			.replace('H', hours)
			.replace('i', minutes)
			.replace('s', seconds);
	}
	
	const formatDateFull = (date: Date, template: string): string => {
		const options: Intl.DateTimeFormatOptions = {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			timeZoneName: 'short'
		};
		
		const formatter = new Intl.DateTimeFormat('en-US', options);
		const parts = formatter.formatToParts(date);
		
		const dateParts: Record<string, string> = {};
		parts.forEach(part => {
			dateParts[part.type] = part.value;
		});
		
		return template
			.replace('YYYY', dateParts.year)
			.replace('MM', dateParts.month)
			.replace('DD', dateParts.day)
			.replace('HH', dateParts.hour)
			.replace('mm', dateParts.minute)
			.replace('ss', dateParts.second)
			.replace('ZZ', dateParts.timeZoneName);
	};
	
	return {
		formatDate,
		formatDateFull
	}
}