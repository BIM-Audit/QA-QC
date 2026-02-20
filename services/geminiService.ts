
import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { Part } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const fileToGenerativePart = (base64: string, mimeType: string) => {
  return {
    inlineData: {
      data: base64,
      mimeType,
    },
  };
};

export const analyzeText = async (
    text: string,
    images: string[] | null,
    options: { preserveFormatting: boolean; useOcr: boolean }
): Promise<string> => {
    try {
        let prompt = 'You are an expert document analysis assistant. Analyze the following content extracted from a single PDF document. Extract key points, important entities (like names, dates, places), and the main topics. Provide your answer in a clear, structured Markdown format.';

        if (options.preserveFormatting) {
            prompt += ' Pay close attention to the original formatting, including line breaks, indentation, and tables. Present the extracted information while preserving this structure.';
        }
        
        if (options.useOcr && images) {
             prompt += ' The following content includes images of each page. Analyze the text within these images in conjunction with the extracted text for a comprehensive analysis.';
        }

        const contents: Part[] = [{ text: prompt }, { text: `Extracted Text:\n\n${text}` }];

        if (options.useOcr && images) {
            for (const image of images) {
                contents.push(fileToGenerativePart(image, 'image/png'));
            }
        }
        
        // Use gemini-3-flash-preview for basic text analysis tasks
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: { parts: contents },
        });

        return response.text;
    } catch (error) {
        console.error("Error analyzing text with Gemini:", error);
        throw new Error("Failed to analyze text.");
    }
};

export const compareTexts = async (
    originalText: string,
    newText: string
): Promise<string> => {
    if (!originalText || !newText) {
        throw new Error("Both original text and new text are required for comparison.");
    }
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `You are a fact-checking expert. Your task is to determine if the "Statement to Verify" is correct or incorrect based *solely* on the provided "Source Document Text".

Analyze the "Source Document Text" as the single source of truth. Then, evaluate the "Statement to Verify".
IMPORTANT: The texts provided have been pre-cleaned to remove invisible control characters. Your task is to compare the visible, printable data only. Base your verdict solely on the content as it appears.

Your response must be a JSON object with two keys: "verdict" and "reasoning".
- The "verdict" must be one of three strings: "Correct", "Incorrect", or "Unverifiable".
- The "reasoning" must be a brief explanation for your verdict, quoting relevant parts from the source text to support your conclusion.

--- Source Document Text ---
${originalText}

--- Statement to Verify ---
${newText}`,
             config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        verdict: {
                            type: Type.STRING,
                            description: "The verdict of the comparison. Can be 'Correct', 'Incorrect', or 'Unverifiable'."
                        },
                        reasoning: {
                            type: Type.STRING,
                            description: "The reasoning behind the verdict, with quotes from the source text."
                        }
                    },
                    required: ["verdict", "reasoning"]
                }
            }
        });
        return response.text;
    } catch (error) {
        console.error("Error comparing texts with Gemini:", error);
        throw new Error("Failed to compare texts.");
    }
};

export const validateData = async (
    pdfText: string,
    excelData: Record<string, any>[]
): Promise<string> => {
    if (!pdfText || !excelData || excelData.length === 0) {
        throw new Error("PDF text and Excel data are required for validation.");
    }

    const originalRecordProperties: { [key: string]: { type: Type } } = {};
    const firstRecord = excelData[0];
    const recordKeys = Object.keys(firstRecord);
    
    if (recordKeys.length === 0) {
        throw new Error("The uploaded data appears to be empty or missing headers.");
    }

    for (const key of recordKeys) {
        originalRecordProperties[key] = { type: Type.STRING };
    }

    try {
        const prompt = `You are a meticulous data validation auditor. Your task is to validate a list of records (provided as a JSON array) against a "Source Document". The "Source Document" is the single source of truth.

For each record in the JSON array, you must determine its validity based *only* on the information present in the "Source Document".

Your response MUST be a JSON array. Each object in your response must have three keys:
1. "originalRecord": The original record object you are validating.
2. "status": A string which must be one of 'Valid', 'Invalid', or 'Needs Review'.
3. "reasoning": A concise explanation for the assigned status, quoting from the Source Document if possible.

--- Source Document ---
${pdfText}

--- Records to Validate (JSON) ---
${JSON.stringify(excelData, null, 2)}`;

        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            originalRecord: {
                                type: Type.OBJECT,
                                properties: originalRecordProperties,
                            },
                            status: {
                                type: Type.STRING,
                                description: "The validation status: 'Valid', 'Invalid', or 'Needs Review'."
                            },
                            reasoning: {
                                type: Type.STRING,
                                description: "A concise explanation for the status."
                            }
                        },
                        required: ["originalRecord", "status", "reasoning"]
                    }
                }
            }
        });
        return response.text;
    } catch (error) {
        console.error("Error validating data with Gemini:", error);
        throw new Error("Failed to validate data.");
    }
};

export const checkFileNames = async (
    pdfText: string,
    excelData: Record<string, any>[]
): Promise<string> => {
    if (!pdfText || !excelData || excelData.length === 0) {
        throw new Error("PDF text with rules and Excel data are required.");
    }

    const originalRecordProperties: { [key: string]: { type: Type } } = {};
    const firstRecord = excelData[0];
    const recordKeys = Object.keys(firstRecord);
    for (const key of recordKeys) {
        originalRecordProperties[key] = { type: Type.STRING };
    }

    const prompt = `Validate file names from Excel against the "File Naming Convention and Abbreviation Rules" in the source document.

Your response MUST be a JSON array. Each object must correspond to a record and have:
1. "originalRecord"
2. "status": 'Valid' or 'Invalid'
3. "reasoning"
4. "invalidValue" (only if invalid)

--- Source Document ---
${pdfText}

--- File Names to Check (JSON) ---
${JSON.stringify(excelData, null, 2)}`;

    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        originalRecord: {
                            type: Type.OBJECT,
                            properties: originalRecordProperties,
                        },
                        status: { type: Type.STRING },
                        reasoning: { type: Type.STRING },
                        invalidValue: { type: Type.STRING }
                    },
                    required: ["originalRecord", "status", "reasoning"]
                }
            }
        }
    });
    return response.text;
};

export const checkProjectUnits = async (
    pdfText: string,
    excelData: Record<string, any>[]
): Promise<string> => {
    if (!pdfText || !excelData || excelData.length === 0) {
        throw new Error("PDF text and Excel data are required.");
    }
    
    const originalRecordProperties: { [key: string]: { type: Type } } = {};
    const firstRecord = excelData[0];
    const recordKeys = Object.keys(firstRecord);
    for (const key of recordKeys) {
        originalRecordProperties[key] = { type: Type.STRING };
    }

    const prompt = `Analyze project units based on source document.

--- Source Document ---
${pdfText}

--- Records to Check (JSON) ---
${JSON.stringify(excelData, null, 2)}`;

    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    summary: {
                        type: Type.OBJECT,
                        properties: {
                           standardFromDocument: { type: Type.STRING },
                            metricCount: { type: Type.NUMBER },
                            imperialCount: { type: Type.NUMBER },
                            otherCount: { type: Type.NUMBER },
                            totalCount: { type: Type.NUMBER },
                            reasoning: { type: Type.STRING }
                        },
                         required: ["standardFromDocument", "metricCount", "imperialCount", "otherCount", "totalCount", "reasoning"]
                    },
                    details: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                originalRecord: { type: Type.OBJECT, properties: originalRecordProperties },
                                status: { type: Type.STRING },
                                reasoning: { type: Type.STRING },
                                invalidValue: { type: Type.STRING }
                            },
                            required: ["originalRecord", "status", "reasoning"]
                        }
                    }
                },
                required: ["summary", "details"]
            }
        }
    });
    return response.text;
};

export const checkSurveyPoints = async (
    pdfText: string,
    excelData: Record<string, any>[]
): Promise<string> => {
    if (!pdfText || !excelData || excelData.length === 0) {
        throw new Error("PDF text and Excel data are required.");
    }
    
    const originalRecordProperties: { [key: string]: { type: Type } } = {};
    const firstRecord = excelData[0];
    const recordKeys = Object.keys(firstRecord);
    for (const key of recordKeys) {
        originalRecordProperties[key] = { type: Type.STRING };
    }

    const prompt = `Validate survey points.

--- Survey Point Data ---
${pdfText}

--- Survey Points to Check ---
${JSON.stringify(excelData, null, 2)}`;

    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        originalRecord: { type: Type.OBJECT, properties: originalRecordProperties },
                        status: { type: Type.STRING },
                        reasoning: { type: Type.STRING },
                        invalidValue: { type: Type.STRING }
                    },
                    required: ["originalRecord", "status", "reasoning"]
                }
            }
        }
    });
    return response.text;
};

export const checkProjectBasePoints = async (
    pdfText: string,
    excelData: Record<string, any>[]
): Promise<string> => {
    if (!pdfText || !excelData || excelData.length === 0) {
        throw new Error("PDF text and Excel data are required.");
    }
    
    const originalRecordProperties: { [key: string]: { type: Type } } = {};
    const firstRecord = excelData[0];
    const recordKeys = Object.keys(firstRecord);
    for (const key of recordKeys) {
        originalRecordProperties[key] = { type: Type.STRING };
    }

    const prompt = `Validate project base points.

--- Project Base Point Data ---
${pdfText}

--- Project Base Points to Check ---
${JSON.stringify(excelData, null, 2)}`;

    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        originalRecord: { type: Type.OBJECT, properties: originalRecordProperties },
                        status: { type: Type.STRING },
                        reasoning: { type: Type.STRING },
                        invalidValue: { type: Type.STRING }
                    },
                    required: ["originalRecord", "status", "reasoning"]
                }
            }
        }
    });
    return response.text;
};

export const checkWorksetNaming = async (
    pdfText: string,
    excelData: Record<string, any>[]
): Promise<string> => {
    if (!pdfText || !excelData || excelData.length === 0) {
        throw new Error("PDF text and Excel data are required.");
    }

    const originalRecordProperties: { [key: string]: { type: Type } } = {};
    const firstRecord = excelData[0];
    const recordKeys = Object.keys(firstRecord);
    for (const key of recordKeys) {
        originalRecordProperties[key] = { type: Type.STRING };
    }

    const prompt = `Validate Workset naming.

--- Source Document ---
${pdfText}

--- Data to Check ---
${JSON.stringify(excelData, null, 2)}`;

    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        originalRecord: { type: Type.OBJECT, properties: originalRecordProperties },
                        status: { type: Type.STRING },
                        reasoning: { type: Type.STRING },
                        invalidValue: { type: Type.STRING }
                    },
                    required: ["originalRecord", "status", "reasoning"]
                }
            }
        }
    });
    return response.text;
};

export const checkStartingViewName = async (
    pdfText: string,
    excelData: Record<string, any>[]
): Promise<string> => {
    if (!pdfText || !excelData || excelData.length === 0) {
        throw new Error("PDF text and Excel data are required.");
    }

    const originalRecordProperties: { [key: string]: { type: Type } } = {};
    const firstRecord = excelData[0];
    const recordKeys = Object.keys(firstRecord);
    for (const key of recordKeys) {
        originalRecordProperties[key] = { type: Type.STRING };
    }

    const prompt = `Validate Starting View Name.

--- Source Document ---
${pdfText}

--- Data to Check ---
${JSON.stringify(excelData, null, 2)}`;

    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        originalRecord: { type: Type.OBJECT, properties: originalRecordProperties },
                        status: { type: Type.STRING },
                        reasoning: { type: Type.STRING },
                        invalidValue: { type: Type.STRING }
                    },
                    required: ["originalRecord", "status", "reasoning"]
                }
            }
        }
    });
    return response.text;
};

/**
 * Performs strict QA QC-2 validation.
 * Analyzes naming convention rules and valid codes from PDF tables.
 * Validates the "File Name" column from the CSV.
 * Returns two sets of data: a high-level summary per file and a detailed item-by-item breakdown.
 */
export const validateQaqc2 = async (
    pdfText: string,
    csvData: Record<string, any>[]
): Promise<string> => {
    if (!pdfText || !csvData || csvData.length === 0) {
        throw new Error("PDF rules and CSV data are required for QA QC-2 validation.");
    }

    const prompt = `You are a BIM QA/QC Auditor. Your task is to perform a strict naming convention audit on a list of file names.

**1. Analyze Source Document (PDF)**:
- Extract the official project naming convention (e.g., [Project]-[Originator]-[Zone]-[Level]-[Type]-[Role]-[Number]).
- Identify the valid codes for each segment by finding corresponding tables in the PDF.

**2. Audit CSV Data**:
- For each row, focus on the "File Name" column.
- Split the file name into segments using the project delimiter (likely a hyphen '-').
- Check if each segment matches a valid code in the identified PDF tables.

**3. Output Format**:
Your response MUST be a JSON object with two keys: "summary" and "detailed".

"summary": Array of objects (one per CSV row).
- "fileName": The full file name string.
- "status": "Pass" (if 0 errors) or "Fail" (if >0 errors).
- "errorsCount": Number of incorrect segments.
- "warningsCount": Number of non-critical issues (e.g., lowercase instead of uppercase if the rule is loose).
- "comment": A short summary (e.g., "Invalid Level and Originator").

"detailed": Array of objects (multiple per file if needed).
- "fileName": The full file name string.
- "segmentName": The part of the convention (e.g., "Originator").
- "segmentValue": The actual value from the file name.
- "status": "Correct" or "Incorrect".
- "validOptions": A list or description of what was expected from the PDF tables.

--- Source Document (PDF Rules & Tables) ---
${pdfText}

--- Data to Validate (JSON) ---
${JSON.stringify(csvData, null, 2)}`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        summary: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    fileName: { type: Type.STRING },
                                    status: { type: Type.STRING },
                                    errorsCount: { type: Type.NUMBER },
                                    warningsCount: { type: Type.NUMBER },
                                    comment: { type: Type.STRING }
                                },
                                required: ["fileName", "status", "errorsCount", "warningsCount", "comment"]
                            }
                        },
                        detailed: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    fileName: { type: Type.STRING },
                                    segmentName: { type: Type.STRING },
                                    segmentValue: { type: Type.STRING },
                                    status: { type: Type.STRING },
                                    validOptions: { type: Type.STRING }
                                },
                                required: ["fileName", "segmentName", "segmentValue", "status", "validOptions"]
                            }
                        }
                    },
                    required: ["summary", "detailed"]
                }
            }
        });
        return response.text;
    } catch (error) {
        console.error("Error in QA QC-2 validation:", error);
        throw new Error("Failed to perform naming convention validation.");
    }
};

export const answerQuestionFromPdf = async (
    pdfText: string,
    question: string
): Promise<string> => {
    if (!pdfText || !question) {
        throw new Error("PDF text and a question are required.");
    }
    try {
        const prompt = `Answer the "Question" based *only* on the provided "Source Document".

--- Source Document ---
${pdfText}

--- Question ---
${question}`;

        const response = await ai.models.generateContent({
            model: "gemini-3-pro-preview",
            contents: prompt,
        });

        return response.text;
    } catch (error) {
        console.error("Error answering question with Gemini:", error);
        throw new Error("Failed to get an answer.");
    }
};

export const generateSpeech = async (text: string): Promise<string> => {
    if (!text) {
        throw new Error("Text is required to generate speech.");
    }
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Zephyr' },
                    },
                },
            },
        });
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
            throw new Error("No audio data received from the API.");
        }
        return base64Audio;
    } catch (error) {
        console.error("Error generating speech with Gemini:", error);
        throw new Error("Failed to generate speech.");
    }
};

export const summarizeDifferences = async (
    originalText: string,
    modifiedText: string
): Promise<string> => {
    if (!originalText || !modifiedText) {
        throw new Error("Both original and modified texts are required.");
    }
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Summarize changes between documents.
            
--- Original Document ---
${originalText.substring(0, 30000)}

--- Modified Document ---
${modifiedText.substring(0, 30000)}`,
        });
        return response.text;
    } catch (error) {
        console.error("Error summarizing differences with Gemini:", error);
        throw new Error("Failed to summarize differences.");
    }
};
