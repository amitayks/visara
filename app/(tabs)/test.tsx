import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator,
  Alert,
  Image as RNImage
} from 'react-native';
import { launchImageLibrary, launchCamera, ImagePickerResponse } from 'react-native-image-picker';
import { documentProcessor } from '../../services/ai/documentProcessor';
import { documentDetector } from '../../services/ai/documentDetector';
import Icon from 'react-native-vector-icons/Ionicons';

interface ProcessingResult {
  detection: any;
  ocr: any;
  metadata: any;
  error?: string;
}

export default function TestScreen() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [useMLKit, setUseMLKit] = useState(true);

  const pickImage = async (useCamera: boolean = false) => {
    try {
      const options = {
        mediaType: 'photo' as const,
        quality: 1 as const,
      };

      const callback = (response: ImagePickerResponse) => {
        if (response.didCancel || response.errorCode) {
          return;
        }
        if (response.assets && response.assets[0]) {
          setSelectedImage(response.assets[0].uri || '');
          setResult(null);
        }
      };

      if (useCamera) {
        launchCamera(options, callback);
      } else {
        launchImageLibrary(options, callback);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const processImage = async () => {
    if (!selectedImage) return;

    setIsProcessing(true);
    setResult(null);

    try {
      if (useMLKit) {
        // Use the ML Kit powered processor
        const processingResult = await documentProcessor.processImage(selectedImage);
        
        setResult({
          detection: {
            type: processingResult.documentType,
            confidence: processingResult.confidence,
          },
          ocr: {
            text: processingResult.ocrText,
            confidence: processingResult.confidence,
          },
          metadata: processingResult.metadata,
        });
      } else {
        // Use the mock detector for comparison
        const detection = await documentDetector.detectDocument(selectedImage);
        const ocr = await documentDetector.performOCR(selectedImage);
        const metadata = await documentDetector.extractMetadata(ocr, detection.type);

        setResult({
          detection,
          ocr,
          metadata,
        });
      }
    } catch (error: any) {
      console.error('Processing error:', error);
      setResult({
        detection: null,
        ocr: null,
        metadata: null,
        error: error.message || 'Failed to process image',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const renderResult = () => {
    if (!result) return null;

    if (result.error) {
      return (
        <View style={styles.resultContainer}>
          <Text style={styles.errorText}>Error: {result.error}</Text>
          <Text style={styles.hintText}>
            Note: ML Kit OCR requires a development build. 
            If using Expo Go, switch to "Mock OCR" mode.
          </Text>
        </View>
      );
    }

    return (
      <ScrollView style={styles.resultContainer}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detection Results</Text>
          <Text style={styles.resultText}>Type: {result.detection?.type || 'Unknown'}</Text>
          <Text style={styles.resultText}>
            Confidence: {((result.detection?.confidence || 0) * 100).toFixed(1)}%
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>OCR Text</Text>
          <Text style={styles.ocrText}>
            {result.ocr?.text || 'No text detected'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Extracted Metadata</Text>
          {result.metadata?.vendor && (
            <Text style={styles.resultText}>Vendor: {result.metadata.vendor}</Text>
          )}
          {result.metadata?.amounts && result.metadata.amounts.length > 0 && (
            <View>
              <Text style={styles.resultText}>Amounts:</Text>
              {result.metadata.amounts.map((amount: any, index: number) => (
                <Text key={index} style={styles.subText}>
                  - {amount.currency} {amount.value} {amount.isTotal ? '(Total)' : ''}
                </Text>
              ))}
            </View>
          )}
          {result.metadata?.dates && result.metadata.dates.length > 0 && (
            <View>
              <Text style={styles.resultText}>Dates:</Text>
              {result.metadata.dates.map((date: any, index: number) => (
                <Text key={index} style={styles.subText}>
                  - {new Date(date.date).toLocaleDateString()} ({date.type})
                </Text>
              ))}
            </View>
          )}
          {result.metadata?.items && result.metadata.items.length > 0 && (
            <View>
              <Text style={styles.resultText}>Items:</Text>
              {result.metadata.items.map((item: any, index: number) => (
                <Text key={index} style={styles.subText}>
                  - {item.name} (${item.price})
                </Text>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>OCR Test Screen</Text>
        
        <View style={styles.modeSelector}>
          <TouchableOpacity
            style={[styles.modeButton, useMLKit && styles.modeButtonActive]}
            onPress={() => setUseMLKit(true)}
          >
            <Text style={[styles.modeText, useMLKit && styles.modeTextActive]}>
              ML Kit OCR
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, !useMLKit && styles.modeButtonActive]}
            onPress={() => setUseMLKit(false)}
          >
            <Text style={[styles.modeText, !useMLKit && styles.modeTextActive]}>
              Mock OCR
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.button} onPress={() => pickImage(false)}>
            <Icon name="images-outline" size={24} color="#FFFFFF" />
            <Text style={styles.buttonText}>Pick from Gallery</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.button} onPress={() => pickImage(true)}>
            <Icon name="camera-outline" size={24} color="#FFFFFF" />
            <Text style={styles.buttonText}>Take Photo</Text>
          </TouchableOpacity>
        </View>

        {selectedImage && (
          <View style={styles.imageContainer}>
            <RNImage source={{ uri: selectedImage }} style={styles.image} />
            <TouchableOpacity
              style={[styles.processButton, isProcessing && styles.buttonDisabled]}
              onPress={processImage}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Icon name="scan-outline" size={24} color="#FFFFFF" />
                  <Text style={styles.buttonText}>Process Image</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {renderResult()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  scrollContent: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  modeSelector: {
    flexDirection: 'row',
    marginBottom: 20,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E5E7',
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  modeButtonActive: {
    backgroundColor: '#0066FF',
  },
  modeText: {
    textAlign: 'center',
    color: '#666666',
    fontWeight: '500',
  },
  modeTextActive: {
    color: '#FFFFFF',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 10,
  },
  button: {
    flex: 1,
    backgroundColor: '#0066FF',
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  imageContainer: {
    marginBottom: 20,
  },
  image: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    marginBottom: 10,
  },
  processButton: {
    backgroundColor: '#34C759',
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  resultContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#E5E5E7',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#000000',
  },
  resultText: {
    fontSize: 14,
    color: '#333333',
    marginBottom: 4,
  },
  subText: {
    fontSize: 13,
    color: '#666666',
    marginLeft: 16,
    marginBottom: 2,
  },
  ocrText: {
    fontSize: 13,
    color: '#333333',
    backgroundColor: '#F2F2F7',
    padding: 12,
    borderRadius: 6,
    fontFamily: 'monospace',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 16,
    marginBottom: 8,
  },
  hintText: {
    color: '#666666',
    fontSize: 13,
    fontStyle: 'italic',
  },
});