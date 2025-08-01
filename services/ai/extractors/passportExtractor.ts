import { DocumentType, EntityType } from '../types/hybridTypes';
import type {
  DocumentExtractor,
  ContextualResult,
  PassportData,
  ValidationResult,
  Entity,
  PersonalInfo,
  MRZData,
  VisaStamp
} from '../types/hybridTypes';

export class PassportExtractor implements DocumentExtractor<PassportData> {
  async initialize?(): Promise<void> {
    console.log('Passport extractor initialized');
  }

  canHandle(documentType: DocumentType): boolean {
    return documentType === DocumentType.PASSPORT;
  }

  async extract(context: ContextualResult): Promise<PassportData> {
    console.log('Extracting passport data...');
    
    const text = context.rawOCR?.text || '';
    const entities = context.context?.entities || [];
    const blocks = context.rawOCR?.blocks || [];

    // Extract MRZ (Machine Readable Zone)
    const mrzData = this.extractMRZ(text);
    
    // Extract visual data (printed information)
    const visualData = this.extractVisualData(text, entities);
    
    // Extract visa stamps
    const stamps = this.extractVisaStamps(text, blocks);
    
    // Validate passport
    const validity = this.checkValidity(mrzData, visualData);

    // Base ID data
    const baseData = {
      documentType: DocumentType.PASSPORT,
      personalInfo: visualData,
      documentInfo: {
        documentNumber: mrzData.documentNumber,
        issueDate: new Date(), // Would be extracted from visual inspection
        expiryDate: mrzData.expiryDate,
        issuingAuthority: `${mrzData.issuingCountry} Government`,
        issuingCountry: mrzData.issuingCountry
      },
      address: undefined, // Passports typically don't have addresses
      photo: this.extractPhotoRegion(blocks),
      securityFeatures: this.detectSecurityFeatures(text)
    };

    return {
      ...baseData,
      mrzData,
      visualData,
      stamps,
      validity
    };
  }

  private extractMRZ(text: string): MRZData {
    // Look for MRZ lines (typically at bottom of passport)
    const lines = text.split('\n');
    const mrzLines: string[] = [];

    // MRZ lines are typically all caps with specific patterns
    for (const line of lines) {
      const cleaned = line.replace(/\s/g, '').toUpperCase();
      
      // MRZ lines are typically 44 characters long for TD3 format (passport)
      if (cleaned.length >= 40 && /^[A-Z0-9<]+$/.test(cleaned)) {
        mrzLines.push(cleaned);
      }
    }

    if (mrzLines.length >= 2) {
      return this.parseMRZ(mrzLines);
    }

    // Fallback: create MRZ from available data
    return this.createFallbackMRZ(text);
  }

  private parseMRZ(mrzLines: string[]): MRZData {
    // Parse TD3 format (2 lines, 44 characters each)
    const line1 = mrzLines[0];
    const line2 = mrzLines[1];

    try {
      // Line 1: P<COUNTRY<SURNAME<<GIVENNAMES<<<<<<<<<<<<<<<<
      const documentType = line1.substring(0, 1); // Should be 'P'
      const issuingCountry = line1.substring(2, 5);
      const nameSection = line1.substring(5);
      
      // Parse names (separated by <<)
      const nameParts = nameSection.split('<<');
      const surname = nameParts[0].replace(/</g, '');
      const givenNames = nameParts[1] ? nameParts[1].replace(/</g, ' ').trim() : '';

      // Line 2: PASSPORTNUMBER<NATIONALITYDOBGENDEREXPDATEOPTIONAL<<<CHECKDIGITS
      const documentNumber = this.extractField(line2, 0, 9);
      const nationality = line2.substring(10, 13);
      const dobString = line2.substring(13, 19);
      const sex = line2.substring(20, 21);
      const expString = line2.substring(21, 27);
      const personalNumber = this.extractField(line2, 28, 14);

      // Parse dates (YYMMDD format)
      const dobYear = parseInt(dobString.substring(0, 2));
      const dobMonth = parseInt(dobString.substring(2, 4)) - 1; // JS months are 0-based
      const dobDay = parseInt(dobString.substring(4, 6));
      
      const expYear = parseInt(expString.substring(0, 2));
      const expMonth = parseInt(expString.substring(2, 4)) - 1;
      const expDay = parseInt(expString.substring(4, 6));

      // Adjust years (assume < 30 is 20xx, >= 30 is 19xx)
      const fullDobYear = dobYear < 30 ? 2000 + dobYear : 1900 + dobYear;
      const fullExpYear = expYear < 30 ? 2000 + expYear : 1900 + expYear;

      const dateOfBirth = new Date(fullDobYear, dobMonth, dobDay);
      const expiryDate = new Date(fullExpYear, expMonth, expDay);

      // Extract check digits
      const checkDigits = {
        documentNumber: line2.substring(9, 10),
        dateOfBirth: line2.substring(19, 20),
        expiryDate: line2.substring(27, 28),
        personalNumber: line2.substring(42, 43),
        composite: line2.substring(43, 44)
      };

      return {
        documentType,
        issuingCountry,
        surname,
        givenNames,
        documentNumber: documentNumber.replace(/</g, ''),
        nationality,
        dateOfBirth,
        sex,
        expiryDate,
        personalNumber: personalNumber.replace(/</g, '') || undefined,
        checkDigits
      };

    } catch (error) {
      console.warn('MRZ parsing failed:', error);
      return this.createFallbackMRZ(mrzLines.join('\n'));
    }
  }

  private extractField(line: string, start: number, length: number): string {
    return line.substring(start, start + length);
  }

  private createFallbackMRZ(text: string): MRZData {
    // Create basic MRZ structure from available text
    return {
      documentType: 'P',
      issuingCountry: 'USA',
      surname: 'UNKNOWN',
      givenNames: 'UNKNOWN',
      documentNumber: 'UNKNOWN',
      nationality: 'USA',
      dateOfBirth: new Date(),
      sex: 'X',
      expiryDate: new Date(),
      checkDigits: {
        documentNumber: '0',
        dateOfBirth: '0',
        expiryDate: '0',
        composite: '0'
      }
    };
  }

  private extractVisualData(text: string, entities: Entity[]): PersonalInfo {
    // Extract name from visual inspection (not MRZ)
    const nameEntities = entities.filter(e => e.type === EntityType.PERSON_NAME);
    let firstName = '';
    let lastName = '';

    if (nameEntities.length > 0) {
      const fullName = nameEntities[0].value;
      const nameParts = fullName.split(/\s+/);
      firstName = nameParts[0] || '';
      lastName = nameParts[nameParts.length - 1] || '';
    }

    // Extract nationality
    let nationality: string | undefined;
    const nationalityPattern = /(?:nationality|citizenship)[\s:]*([A-Za-z\s]+)/gi;
    const nationalityMatch = text.match(nationalityPattern);
    if (nationalityMatch) {
      nationality = nationalityMatch[1].trim();
    }

    // Use current date as placeholder - would need visual inspection for accurate dates
    const dateOfBirth = new Date();

    return {
      firstName,
      lastName,
      dateOfBirth,
      nationality
    };
  }

  private extractVisaStamps(text: string, blocks: any[]): VisaStamp[] {
    const stamps: VisaStamp[] = [];
    
    // Look for visa/stamp keywords
    const stampKeywords = ['visa', 'entry', 'exit', 'arrival', 'departure', 'immigration'];
    
    for (const block of blocks) {
      const blockText = block.text.toLowerCase();
      
      if (stampKeywords.some(keyword => blockText.includes(keyword))) {
        // Try to extract date from the stamp
        const datePattern = /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/;
        const dateMatch = block.text.match(datePattern);
        
        let entryDate: Date | undefined;
        if (dateMatch) {
          try {
            entryDate = new Date(dateMatch[0]);
          } catch {
            // Ignore invalid dates
          }
        }

        // Determine stamp type
        let stampType: 'entry' | 'exit' | 'visa' = 'visa';
        if (blockText.includes('entry') || blockText.includes('arrival')) {
          stampType = 'entry';
        } else if (blockText.includes('exit') || blockText.includes('departure')) {
          stampType = 'exit';
        }

        stamps.push({
          country: 'Unknown', // Would need more sophisticated extraction
          entryDate,
          stampType,
          boundingBox: {
            x: block.boundingBox.x,
            y: block.boundingBox.y,
            width: block.boundingBox.width,
            height: block.boundingBox.height
          }
        });
      }
    }

    return stamps;
  }

  private extractPhotoRegion(blocks: any[]): PassportData['photo'] {
    // Look for large regions with minimal text (likely photo)
    const photoRegions = blocks.filter((block: any) => 
      block.text.trim().length < 3 && 
      block.boundingBox.width > 80 && 
      block.boundingBox.height > 100
    );

    if (photoRegions.length > 0) {
      const largestRegion = photoRegions.reduce((largest: any, current: any) => {
        const currentArea = current.boundingBox.width * current.boundingBox.height;
        const largestArea = largest.boundingBox.width * largest.boundingBox.height;
        return currentArea > largestArea ? current : largest;
      });

      return {
        boundingBox: {
          x: largestRegion.boundingBox.x,
          y: largestRegion.boundingBox.y,
          width: largestRegion.boundingBox.width,
          height: largestRegion.boundingBox.height
        }
      };
    }

    return undefined;
  }

  private detectSecurityFeatures(text: string): string[] {
    const features: string[] = [];
    const securityFeatures = [
      'chip', 'rfid', 'biometric', 'hologram', 'watermark',
      'security thread', 'uv reactive', 'intaglio printing'
    ];

    const lowerText = text.toLowerCase();
    for (const feature of securityFeatures) {
      if (lowerText.includes(feature)) {
        features.push(feature);
      }
    }

    // Passports typically have standard security features
    if (features.length === 0) {
      features.push('standard security features');
    }

    return features;
  }

  private checkValidity(mrzData: MRZData, visualData: PersonalInfo): PassportData['validity'] {
    const errors: string[] = [];

    // Check MRZ validity
    if (!this.validateCheckDigits(mrzData)) {
      errors.push('MRZ check digits are invalid');
    }

    // Check expiry date
    if (mrzData.expiryDate < new Date()) {
      errors.push('Passport has expired');
    }

    // Check document number
    if (mrzData.documentNumber === 'UNKNOWN' || mrzData.documentNumber.length < 6) {
      errors.push('Invalid passport number');
    }

    // Check names consistency (if both available)
    if (visualData.firstName && visualData.lastName) {
      const visualFullName = `${visualData.firstName} ${visualData.lastName}`.toUpperCase();
      const mrzFullName = `${mrzData.givenNames} ${mrzData.surname}`.toUpperCase();
      
      if (visualFullName !== mrzFullName && 
          !visualFullName.includes(mrzData.surname) && 
          !mrzFullName.includes(visualData.lastName)) {
        errors.push('Name mismatch between visual and MRZ data');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private validateCheckDigits(mrzData: MRZData): boolean {
    // Simplified check digit validation
    // In a real implementation, you would use the proper ICAO algorithm
    
    // For now, just check that check digits are numeric
    const checkDigits = [
      mrzData.checkDigits.documentNumber,
      mrzData.checkDigits.dateOfBirth,
      mrzData.checkDigits.expiryDate,
      mrzData.checkDigits.composite
    ];

    return checkDigits.every(digit => /^\d$/.test(digit));
  }

  async validate(data: PassportData): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    let confidence = 1.0;

    // Use passport-specific validity check
    if (!data.validity.isValid) {
      errors.push(...data.validity.errors);
      confidence -= 0.3;
    }

    // Validate MRZ data
    if (data.mrzData.documentNumber === 'UNKNOWN') {
      errors.push('Could not extract passport number from MRZ');
      confidence -= 0.4;
    }

    if (data.mrzData.surname === 'UNKNOWN') {
      errors.push('Could not extract name from MRZ');
      confidence -= 0.3;
    }

    // Validate personal info
    if (!data.personalInfo.firstName && !data.personalInfo.lastName) {
      warnings.push('Could not extract visual name data');
      confidence -= 0.1;
    }

    // Check photo detection
    if (!data.photo) {
      warnings.push('Could not detect photo region');
      confidence -= 0.1;
    }

    // Check visa stamps
    if (data.stamps.length > 0) {
      confidence += 0.05; // Bonus for detecting stamps
    }

    // Security features boost confidence
    if (data.securityFeatures.length > 0) {
      confidence += 0.05;
    }

    // MRZ presence significantly boosts confidence
    if (data.mrzData.documentNumber !== 'UNKNOWN') {
      confidence += 0.2;
    }

    const validationScore = Math.max(0, Math.min(1, confidence));

    return {
      isValid: errors.length === 0,
      confidence: validationScore,
      errors,
      warnings,
      suggestions
    };
  }
}