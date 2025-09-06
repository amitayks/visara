export const formatDate = (date?: Date) => {
	if (!date) return "No date";
	return new Date(date).toLocaleDateString("en-US", {
		weekday: "short",
		month: "long",
		day: "numeric",
		year: "numeric",
	});
};

export const formatCurrency = (amount?: number) => {
	if (!amount) return null;
	return `$${amount.toFixed(2)}`;
};
