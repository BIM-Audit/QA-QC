/**
 * Cleans a string by removing invisible Unicode control characters.
 * @param input The string to clean.
 * @returns The cleaned string.
 */
export const cleanText = (input: any): any => {
    if (typeof input !== 'string') return input;
    // This regex removes characters in the "Control" (Cc) and "Format" (Cf) Unicode categories.
    // This includes characters like null, backspace, and the LRE/RLE characters from the example.
    // It preserves standard whitespace like spaces, tabs, and newlines.
    return input.replace(/[\p{Cc}\p{Cf}]/gu, '');
};
