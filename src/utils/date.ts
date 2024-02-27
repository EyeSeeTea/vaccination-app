import moment, { Moment } from "moment";

export function toISOStringNoTZ(date: Moment) {
    return date.format("YYYY-MM-DDTHH:mm:ss");
}

export function formatDateLong(inputDate: string | Date | Moment | undefined): string {
    if (!inputDate) {
        return "";
    } else {
        const date = moment(inputDate);
        return date.format("YYYY-MM-DD HH:mm:ss");
    }
}

export function formatDateShort(inputDate: string | Date | Moment | undefined): string {
    if (!inputDate) {
        return "";
    } else {
        const date = moment(inputDate);
        return date.format("YYYY-MM-DD");
    }
}

export function getDaysRange(startDate: Moment | null, endDate: Moment | null): Moment[] {
    if (!startDate || !endDate) {
        return [];
    } else {
        const currentDate = startDate.clone();
        let outputDates: Moment[] = [];

        while (currentDate <= endDate) {
            outputDates.push(currentDate.clone());
            currentDate.add(1, "days");
        }
        return outputDates;
    }
}

export function formatDay(date: Date, options: { daysToAdd: number } = { daysToAdd: 0 }): string {
    const date2 = new Date(date);
    date2.setDate(date2.getDate() + options.daysToAdd);
    return date2.toISOString().split("T")[0];
}
