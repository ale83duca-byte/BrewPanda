export const addMonthsAndFormat = (dateStr: string, months: number): string => {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return 'Data non valida';
    
    // new Date(year, monthIndex, day)
    const [day, month, year] = parts.map(Number);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return 'Data non valida';
    
    const date = new Date(year, month - 1, day);
    if (isNaN(date.getTime())) return 'Data non valida';
    
    date.setMonth(date.getMonth() + months);
    
    const newDay = String(date.getDate()).padStart(2, '0');
    const newMonth = String(date.getMonth() + 1).padStart(2, '0');
    const newYear = date.getFullYear();
    
    return `${newDay}/${newMonth}/${newYear}`;
};

export const parseItalianDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const [day, month, year] = parts.map(Number);
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
            // new Date(year, monthIndex, day)
            const date = new Date(year, month - 1, day);
            // Basic validation to check if the date is valid (e.g., not 32/13/2023)
            if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
                return date;
            }
        }
    }
    return null;
};
