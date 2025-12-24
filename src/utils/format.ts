export function formatNumber(num: number | bigint): string {
    const n = Number(num);
    if (n >= 1_000_000_000) {
        return (n / 1_000_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'B';
    }
    if (n >= 1_000_000) {
        return (n / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'M';
    }
    if (n >= 1_000) {
        return (n / 1_000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'K';
    }
    return n.toLocaleString('en-US');
}

export function parseStatsInput(input: string): bigint {
    const raw = input.toLowerCase().trim();

    // Check for suffixes
    if (raw.endsWith('b')) {
        const num = parseFloat(raw.replace('b', ''));
        return BigInt(Math.floor(num * 1_000_000_000));
    }
    if (raw.endsWith('m')) {
        const num = parseFloat(raw.replace('m', ''));
        return BigInt(Math.floor(num * 1_000_000));
    }
    if (raw.endsWith('k')) {
        const num = parseFloat(raw.replace('k', ''));
        return BigInt(Math.floor(num * 1_000));
    }

    // Default: treat as raw number if no suffix (legacy support removed)
    // "30" -> 30
    const num = parseFloat(raw);
    return BigInt(Math.floor(isNaN(num) ? 0 : num));
}
