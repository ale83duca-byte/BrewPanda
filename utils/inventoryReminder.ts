export const isInventoryDay = (): boolean => {
    const today = new Date();
    // Day 1 is Monday
    if (today.getDay() !== 1) {
        return false;
    }
    // Check if it's in the first 7 days of the month
    return today.getDate() <= 7;
};