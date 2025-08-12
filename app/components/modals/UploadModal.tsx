import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  launchImageLibrary,
  launchCamera,
  ImagePickerResponse,
  MediaType,
  PhotoQuality,
} from 'react-native-image-picker';
import Animated, {
  FadeIn,
  FadeOut,
  Easing,
} from 'react-native-reanimated';
import { showToast } from './Toast';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface UploadModalProps {
  visible: boolean;
  onClose: () => void;
  onUploadComplete: (imageUri: string) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  visible,
  onClose,
  onUploadComplete,
}) => {
  const [processing, setProcessing] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const imagePickerOptions = {
    mediaType: 'photo' as MediaType,
    includeBase64: false,
    maxHeight: 2000,
    maxWidth: 2000,
    quality: 0.8 as PhotoQuality,
  };

  const handleLaunchGallery = () => {
    launchImageLibrary(imagePickerOptions, handleImageResponse);
  };

  const handleLaunchCamera = () => {
    launchCamera(imagePickerOptions, handleImageResponse);
  };

  const handleImageResponse = (response: ImagePickerResponse) => {
    if (response.didCancel || response.errorMessage) {
      if (response.errorMessage) {
        showToast({
          type: 'error',
          message: response.errorMessage,
          icon: 'alert-circle',
        });
      }
      return;
    }

    if (response.assets && response.assets[0]) {
      const imageUri = response.assets[0].uri;
      if (imageUri) {
        setSelectedImage(imageUri);
        processImage(imageUri);
      }
    }
  };

  const processImage = async (imageUri: string) => {
    setProcessing(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      onUploadComplete(imageUri);
      showToast({
        type: 'success',
        message: 'Document uploaded successfully',
        icon: 'checkmark-circle',
      });
      
      handleClose();
    } catch (error) {
      showToast({
        type: 'error',
        message: 'Failed to process document',
        icon: 'alert-circle',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = () => {
    setSelectedImage(null);
    setProcessing(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={handleClose}
        />
        
        <Animated.View
          entering={FadeIn.duration(350).easing(Easing.out(Easing.cubic))}
          exiting={FadeOut.duration(300)}
          style={styles.container}
        >
          {/* <View style={styles.handle} /> */}
          
          <View style={styles.header}>
            <Text style={styles.title}>Upload Document</Text>
            {/* <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Icon name="close" size={24} color="#333" />
            </TouchableOpacity> */}
          </View>
          
          {processing ? (
            <View style={styles.processingContainer}>
              {selectedImage && (
                <Image
                  source={{ uri: selectedImage }}
                  style={styles.previewImage}
                  resizeMode="contain"
                />
              )}
              <ActivityIndicator size="large" color="#6366F1" />
              <Text style={styles.processingText}>Processing document...</Text>
            </View>
          ) : (
            <View style={styles.content}>
              <Text style={styles.subtitle}>
                Choose a document from your gallery
              </Text>
              
              <View style={styles.options}>
                <TouchableOpacity
                  style={styles.optionButton}
                  onPress={handleLaunchGallery}
                  activeOpacity={0.7}
                >
                  <View style={styles.optionIcon}>
                    <Icon name="images" size={32} color="#6366F1" />
                  </View>
                  <Text style={styles.optionTitle}>Gallery</Text>
                  <Text style={styles.optionDescription}>
                    Select from your photos
                  </Text>
                </TouchableOpacity>
                
                {/* <TouchableOpacity
                  style={styles.optionButton}
                  onPress={handleLaunchCamera}
                  activeOpacity={0.7}
                >
                  <View style={styles.optionIcon}>
                    <Icon name="camera" size={32} color="#6366F1" />
                  </View>
                  <Text style={styles.optionTitle}>Camera</Text>
                  <Text style={styles.optionDescription}>
                    Take a new photo
                  </Text>
                </TouchableOpacity> */}
              </View>
              
              <View style={styles.tipContainer}>
                <Icon name="information-circle" size={20} color="#999" />
                <Text style={styles.tipText}>
                  For best results, ensure the document is well-lit and clearly visible
                </Text>
              </View>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    marginTop: SCREEN_HEIGHT * 0.1,
    maxHeight: SCREEN_HEIGHT * 0.9,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 15,
  },
  // handle: {
  //   width: 40,
  //   height: 4,
  //   backgroundColor: '#DDD',
  //   borderRadius: 2,
  //   alignSelf: 'center',
  //   marginTop: 12,
  // },
  header: {
    // flexDirection: 'row',
    alignItems: 'center',
    // justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  // closeButton: {
  //   padding: 8,
  // },
  content: {
    padding: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  options: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  optionButton: {
    flex: 1,
    backgroundColor: '#F8F8FA',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#F0F0F0',
  },
  optionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F0F0FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
  },
  tipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F8FA',
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  processingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  previewImage: {
    width: 200,
    height: 200,
    marginBottom: 24,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
  },
  processingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
});