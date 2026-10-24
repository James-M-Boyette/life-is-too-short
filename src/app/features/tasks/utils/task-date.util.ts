export function parseLocalDate(value: string | null): Date | null {
    if (!value) return null;

    const [year, month, day] = value.split('-').map(Number);

    return new Date(year, month - 1, day);
}

export function formatLocalDate(value: Date | null): string | null {
    if (!value) return null;

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}
