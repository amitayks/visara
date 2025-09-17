import { useNavigation } from "@react-navigation/native";
import { useEffect, useState } from "react";
import {
	ScrollView,
	StatusBar,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme, useThemedStyles } from "../contexts/ThemeContext";
import { backgroundScanner } from "../services/gallery/backgroundScanner";
import { useSettingsStore } from "../stores/settingsStore";
import { ScanFrequencyPicker } from "./components/ScanFrequencyPicker";
import { ScanStatus } from "./components/ScanStatus";
import { SettingsFooter } from "./components/SettingsFooter";
import { SettingsSectionHeader } from "./components/SettingsSectionHeader";
import { ToggleBar } from "./components/ToggleBar";
import { LegalModal } from "./components/LegalModal";
import { LegalButtons, type LegalButtonData } from "./components/LegalButtons";
import { createStyles } from "./settings.style";
import { userAgreement } from "../constants/USER_AGREEMENT";
import { privacyPolicy } from "../constants/PRIVACY_POLICY";

export default function SettingsScreen() {
	const navigation = useNavigation();
	const { theme, isDark, toggleTheme } = useTheme();
	const { settings, updateSetting } = useSettingsStore();
	const styles = useThemedStyles(createStyles);
	const [scanStatus, setScanStatus] = useState<any>(null);

	// Legal modal states
	const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
	const [showUserAgreement, setShowUserAgreement] = useState(false);

	// Legal buttons configuration
	const legalButtons: LegalButtonData[] = [
		{
			title: "Privacy Policy",
			subtitle: "How we protect your data",
			icon: "shield-checkmark-outline",
			onPress: () => setShowPrivacyPolicy(true),
		},
		{
			title: "User Agreement",
			subtitle: "Terms and conditions",
			icon: "document-text-outline",
			onPress: () => setShowUserAgreement(true),
		},
	];

	// **Effective Date: 17/09/2025**
	// **Last Updated: 17/09/2025**

	// ## 1. ACCEPTANCE OF TERMS

	// This User Agreement ("Agreement") is a legal agreement between you ("User," "you," or "your") and Keisar ("Company," "we," "us," or "our"), a small business registered in Israel, for the use of the Visara application ("App" or "Service").

	// By downloading, installing, or using Visara, you agree to be bound by this Agreement. If you do not agree to these terms, do not use the App.

	// ## 2. DESCRIPTION OF SERVICE

	// Visara is an AI-powered gallery application that:
	// - Scans and analyzes photos and PDF documents stored on your device
	// - Uses local AI and OCR technology to make your documents searchable
	// - Allows natural language search of your content
	// - Processes all data locally on your device without sending information to external servers

	// ## 3. ELIGIBILITY

	// By using Visara, you represent that:
	// - You are at least 13 years of age
	// - You have the legal capacity to enter into this Agreement
	// - Your use of the App complies with all applicable laws and regulations

	// **Parental Consent**: If you are between 13 and 18 years old (or the age of majority in your jurisdiction), you must have your parent or guardian's permission to use the App.

	// ## 4. ACCOUNT REGISTRATION

	// You may use Visara by:
	// - Creating an account through Google authentication
	// - Creating an account through Apple authentication
	// - Using guest mode (limited functionality)

	// You are responsible for:
	// - Maintaining the confidentiality of your account credentials
	// - All activities that occur under your account
	// - Notifying us immediately of any unauthorized use

	// ## 5. PURCHASE AND PAYMENT

	// ### 5.1 One-Time Purchase
	// Visara is available as a one-time purchase through:
	// - Google Play Store
	// - Apple App Store

	// ### 5.2 Payment Processing
	// All payments are processed by the respective app store. We do not directly handle payment information.

	// ### 5.3 Pricing
	// Prices are displayed in US Dollars and include all applicable taxes.

	// ### 5.4 Refunds
	// Refund requests must be made through the app store where you purchased the App, subject to their refund policies:
	// - Google Play Store refund policy
	// - Apple App Store refund policy

	// ## 6. LICENSE GRANT

	// Subject to your compliance with this Agreement, we grant you a limited, non-exclusive, non-transferable, revocable license to:
	// - Download and install the App on devices you own or control
	// - Use the App for personal, non-commercial purposes

	// ## 7. USER CONTENT

	// ### 7.1 Your Content
	// You retain all rights to photos, PDFs, and other content you process through the App ("User Content").

	// ### 7.2 Local Processing
	// All User Content is processed locally on your device. We do not:
	// - Access your User Content
	// - Store your User Content on our servers
	// - Share your User Content with third parties

	// ### 7.3 Your Responsibilities
	// You represent and warrant that:
	// - You own or have the right to use all User Content
	// - Your User Content does not violate any laws or third-party rights
	// - You are solely responsible for your User Content

	// ## 8. PROHIBITED USES

	// You agree not to:
	// - Use the App for any illegal purposes
	// - Attempt to reverse engineer, decompile, or disassemble the App
	// - Modify, adapt, or create derivative works of the App
	// - Remove or alter any proprietary notices
	// - Use the App to process content that infringes on others' rights
	// - Circumvent any security features of the App
	// - Use the App for commercial purposes without our written consent
	// - Share or distribute your licensed copy of the App

	// ## 9. INTELLECTUAL PROPERTY

	// ### 9.1 Our Rights
	// The App and all related content (excluding User Content) are owned by Keisar and protected by intellectual property laws. All rights not expressly granted are reserved.

	// ### 9.2 Feedback
	// Any feedback, suggestions, or ideas you provide about the App become our property and may be used without compensation to you.

	// ## 10. PRIVACY

	// Your use of Visara is also governed by our Privacy Policy, which is incorporated into this Agreement by reference.

	// ## 11. THIRD-PARTY SERVICES

	// The App may interact with third-party services including:
	// - Google authentication services
	// - Apple authentication services
	// - App store services

	// Your use of these services is subject to their respective terms and conditions.

	// ## 12. DISCLAIMERS

	// ### 12.1 "AS IS" Service
	// THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

	// ### 12.2 AI Limitations
	// We do not guarantee that the AI-powered features will:
	// - Be 100% accurate in analyzing or summarizing content
	// - Correctly identify all text in images or PDFs
	// - Provide perfect search results

	// ### 12.3 Data Loss
	// We are not responsible for any loss of data resulting from:
	// - App deletion
	// - Device failure
	// - User error
	// - Software bugs

	// ## 13. LIMITATION OF LIABILITY

	// TO THE MAXIMUM EXTENT PERMITTED BY LAW:
	// - We shall not be liable for any indirect, incidental, special, consequential, or punitive damages
	// - Our total liability shall not exceed the amount you paid for the App
	// - These limitations apply regardless of the legal theory on which the claim is based

	// ## 14. INDEMNIFICATION

	// You agree to indemnify and hold harmless Keisar, its officers, directors, employees, and agents from any claims, damages, losses, or expenses arising from:
	// - Your use of the App
	// - Your User Content
	// - Your violation of this Agreement
	// - Your violation of any rights of another party

	// ## 15. TERMINATION

	// ### 15.1 By You
	// You may terminate this Agreement at any time by deleting the App from your device.

	// ### 15.2 By Us
	// We may terminate or suspend your access to the App immediately, without prior notice, if:
	// - You breach this Agreement
	// - We are required to do so by law
	// - We discontinue the App

	// ### 15.3 Effect of Termination
	// Upon termination:
	// - Your license to use the App ends immediately
	// - All data stored locally on your device remains under your control
	// - Sections that by their nature should survive termination will remain in effect

	// ## 16. MODIFICATIONS TO AGREEMENT

	// We may modify this Agreement at any time. We will notify you of material changes through:
	// - In-app notifications
	// - At least 30 days before changes take effect

	// Your continued use of the App after changes constitutes acceptance of the modified Agreement.

	// ## 17. GOVERNING LAW AND DISPUTES

	// ### 17.1 Governing Law
	// This Agreement is governed by the laws of the State of Israel, without regard to conflict of law principles.

	// ### 17.2 Jurisdiction
	// Any disputes arising from this Agreement shall be resolved exclusively in the Magistrate Court of Tel Aviv (בית משפט השלום תל אביב).

	// ### 17.3 Class Action Waiver
	// TO THE EXTENT PERMITTED BY LAW, YOU WAIVE ANY RIGHT TO BRING CLAIMS ON A CLASS, CONSOLIDATED, OR REPRESENTATIVE BASIS.

	// ## 18. GENERAL PROVISIONS

	// ### 18.1 Entire Agreement
	// This Agreement and the Privacy Policy constitute the entire agreement between you and Keisar regarding the App.

	// ### 18.2 Severability
	// If any provision is found unenforceable, the remaining provisions will continue in effect.

	// ### 18.3 No Waiver
	// Our failure to enforce any right or provision is not a waiver of that right or provision.

	// ### 18.4 Assignment
	// You may not assign this Agreement. We may assign our rights and obligations without restriction.

	// ### 18.5 Force Majeure
	// We are not liable for any delay or failure to perform due to causes beyond our reasonable control.

	// ## 19. CONTACT INFORMATION

	// For questions about this Agreement, contact us at:

	// **Keisar**
	// Email: Keisarclub@gmail.com
	// Address: HaTikva 9, Karnei Shomron, Israel

	// ---

	// **By using Visara, you acknowledge that you have read, understood, and agree to be bound by this User Agreement.**`;

	// Monitor scan status
	useEffect(() => {
		const updateStatus = async () => {
			try {
				const status = await backgroundScanner.getBackgroundServiceStatus();
				setScanStatus(status);
			} catch (error) {
				console.error("Error getting scan status:", error);
			}
		};

		// Initial status check
		updateStatus();

		// Update status every 3 seconds while on settings page
		const interval = setInterval(updateStatus, 3000);

		return () => clearInterval(interval);
	}, []);

	const handleGoBack = () => {
		navigation.goBack();
	};

	return (
		<SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
			<StatusBar
				barStyle={isDark ? "light-content" : "dark-content"}
				backgroundColor={theme.background}
			/>

			{/* Header */}
			<View style={styles.header}>
				<TouchableOpacity
					style={styles.backButton}
					onPress={handleGoBack}
					activeOpacity={0.7}
				>
					<Icon name="chevron-back" size={24} color={theme.text} />
				</TouchableOpacity>
				{/* <View style={styles.headerSpacer} /> */}
				<Text style={styles.headerTitle}>Settings</Text>
			</View>

			<ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
				{/* Appearance Section */}
				<SettingsSectionHeader title="Appearance" />
				<ToggleBar
					onPress={toggleTheme}
					isChange={isDark}
					title={["Dark Mode", "Light Mode"]}
					subtitle={["Switch to light theme", "Switch to dark theme"]}
					iconsName={["moon", "sunny"]}
				/>

				{/* Scanning Section */}
				<SettingsSectionHeader title="Document Scanning" />

				<ToggleBar
					onPress={() =>
						updateSetting("smartFilterEnabled", !settings.smartFilterEnabled)
					}
					isChange={settings.smartFilterEnabled}
					title={["Smart Filter On", "Smart Filter Off"]}
					subtitle={["Filter out non-documents", "Scan all images"]}
					iconsName={["funnel", "funnel-outline"]}
				/>

				<ToggleBar
					onPress={() => updateSetting("batterySaver", !settings.batterySaver)}
					isChange={settings.batterySaver}
					title={["Battery Saver On", "Battery Saver Off"]}
					subtitle={[
						"Reduce scanning in low battery",
						"Normal scanning frequency",
					]}
					iconsName={["battery-half", "battery-full"]}
				/>

				<ToggleBar
					onPress={() => updateSetting("autoScan", !settings.autoScan)}
					isChange={settings.autoScan}
					title={["Auto-Scan Enabled", "Auto-Scan Disabled"]}
					subtitle={[
						"Automatically scan new images",
						"Only scan when manually triggered",
					]}
					iconsName={["scan", "scan"]}
				/>

				<ScanFrequencyPicker
					value={settings.scanFrequency}
					onValueChange={(frequency) =>
						updateSetting("scanFrequency", frequency)
					}
					disabled={!settings.autoScan}
				/>

				{settings.autoScan && scanStatus && (
					<>
						<SettingsSectionHeader title="Scanning Status" />
						<ScanStatus scanStatus={scanStatus} />
					</>
				)}

				<LegalButtons buttons={legalButtons} />

				<SettingsFooter />
			</ScrollView>

			{/* Legal Modals */}
			<LegalModal
				visible={showPrivacyPolicy}
				title="Privacy Policy"
				content={privacyPolicy}
				onClose={() => setShowPrivacyPolicy(false)}
			/>

			<LegalModal
				visible={showUserAgreement}
				title="User Agreement"
				content={userAgreement}
				onClose={() => setShowUserAgreement(false)}
			/>
		</SafeAreaView>
	);
}
