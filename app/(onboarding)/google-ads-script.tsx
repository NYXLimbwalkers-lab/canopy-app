import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/lib/stores/authStore';

const SCRIPT = `// CANOPY TREE SERVICE — Google Ads Script
// Paste this into Google Ads > Tools > Scripts
// It reads from your connected Google Sheet and writes performance data back.

function main() {
  var spreadsheetUrl = "PASTE_YOUR_SHEET_URL_HERE";
  var ss = SpreadsheetApp.openByUrl(spreadsheetUrl);

  // Read campaign commands from sheet
  var commandSheet = ss.getSheetByName("Commands");
  var perfSheet = ss.getSheetByName("Performance");

  if (!commandSheet || !perfSheet) {
    Logger.log("Create sheets named 'Commands' and 'Performance'");
    return;
  }

  var commands = commandSheet.getDataRange().getValues();

  for (var i = 1; i < commands.length; i++) {
    var action = commands[i][0];
    var campaignName = commands[i][1];
    var budget = commands[i][2];

    if (action === "CREATE") {
      createCampaign(campaignName, budget);
    } else if (action === "PAUSE") {
      pauseCampaign(campaignName);
    } else if (action === "ADJUST_BID") {
      adjustBids(campaignName, commands[i][3]);
    }
  }

  // Write performance back to sheet
  writePerformance(perfSheet);
}

function createCampaign(name, dailyBudget) {
  var budget = AdWordsApp.budgets().newBudgetBuilder()
    .withName(name + " Budget")
    .withAmount(dailyBudget)
    .withDeliveryMethod("STANDARD")
    .build();

  var campaign = AdWordsApp.newCampaignBuilder()
    .withName(name)
    .withStatus("ENABLED")
    .withBiddingStrategy("TARGET_CPA")
    .withBudget(budget)
    .build();

  Logger.log("Created campaign: " + name);
}

function pauseCampaign(name) {
  var it = AdWordsApp.campaigns().withCondition("Name = '" + name + "'").get();
  while (it.hasNext()) { it.next().pause(); }
}

function adjustBids(campaignName, targetCpa) {
  var it = AdWordsApp.campaigns().withCondition("Name = '" + campaignName + "'").get();
  while (it.hasNext()) {
    var campaign = it.next();
    campaign.bidding().setTargetCpa(targetCpa);
  }
}

function writePerformance(sheet) {
  var now = new Date();
  var dateStr = Utilities.formatDate(now, "America/New_York", "yyyy-MM-dd");
  var it = AdWordsApp.campaigns().forDateRange("TODAY").get();
  var row = 2;

  while (it.hasNext()) {
    var c = it.next();
    var stats = c.getStatsFor("TODAY");
    sheet.getRange(row, 1).setValue(dateStr);
    sheet.getRange(row, 2).setValue(c.getName());
    sheet.getRange(row, 3).setValue(stats.getCost());
    sheet.getRange(row, 4).setValue(stats.getClicks());
    sheet.getRange(row, 5).setValue(stats.getImpressions());
    sheet.getRange(row, 6).setValue(stats.getConversions());
    row++;
  }
  Logger.log("Performance written for " + (row - 2) + " campaigns.");
}`;

export default function GoogleAdsScriptStep() {
  const { updateOnboardingStep } = useAuthStore();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    // In production use Clipboard API
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    Alert.alert('Copied!', 'Script copied. Now go to Google Ads and paste it.');
  };

  const handleNext = async () => {
    await updateOnboardingStep(7);
    router.push('/(onboarding)/ai-strategy');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.progress}>
        {[1,2,3,4,5,6,7,8,9].map(i => (
          <View key={i} style={[styles.dot, i === 6 && styles.dotActive, i < 6 && styles.dotDone]} />
        ))}
      </View>

      <Text style={styles.step}>Step 6 of 9</Text>
      <Text style={styles.title}>Set up Google Ads (5 minutes)</Text>
      <Text style={styles.subtitle}>Follow these exact steps. You don't need to understand Google Ads — just click where we say to click.</Text>

      <View style={styles.instructions}>
        {[
          { num: '1', text: 'Go to ads.google.com and log in' },
          { num: '2', text: 'Click "Tools & Settings" in the top menu' },
          { num: '3', text: 'Click "Scripts" under Bulk Actions' },
          { num: '4', text: 'Click the blue "+" button' },
          { num: '5', text: 'Paste the script below and click "Save"' },
          { num: '6', text: 'Click "Authorize" and approve permissions' },
          { num: '7', text: 'Set frequency to "Every hour"' },
        ].map(step => (
          <View key={step.num} style={styles.instructionRow}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>{step.num}</Text></View>
            <Text style={styles.instructionText}>{step.text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.scriptBox}>
        <View style={styles.scriptHeader}>
          <Text style={styles.scriptLabel}>Google Ads Script — copy this</Text>
          <TouchableOpacity onPress={handleCopy} style={styles.copyBtn}>
            <Text style={styles.copyBtnText}>{copied ? '✓ Copied!' : 'Copy'}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal style={styles.scriptScroll}>
          <Text style={styles.scriptText}>{SCRIPT.slice(0, 400)}...</Text>
        </ScrollView>
      </View>

      <Button label="I pasted the script →" onPress={handleNext} size="lg" />
      <Button label="I'll do this later" onPress={handleNext} variant="ghost" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Theme.layout.screenPadding, gap: 16, paddingBottom: 40 },
  progress: { flexDirection: 'row', gap: 6, justifyContent: 'center', paddingTop: 52, paddingBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  dotActive: { backgroundColor: Colors.primary, width: 24 },
  dotDone: { backgroundColor: Colors.primaryLight },
  step: { fontSize: Theme.font.size.small, color: Colors.textSecondary, fontWeight: Theme.font.weight.medium },
  title: { fontSize: Theme.font.size.headline, fontWeight: Theme.font.weight.bold, color: Colors.text },
  subtitle: { fontSize: Theme.font.size.body, color: Colors.textSecondary, lineHeight: 24 },
  instructions: { backgroundColor: Colors.surface, padding: 16, borderRadius: Theme.radius.xl, gap: 12, ...Theme.shadow.sm },
  instructionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: Colors.textInverse, fontWeight: Theme.font.weight.bold, fontSize: Theme.font.size.small },
  instructionText: { flex: 1, fontSize: Theme.font.size.body, color: Colors.text, lineHeight: 24 },
  scriptBox: { backgroundColor: '#0D1117', borderRadius: Theme.radius.lg, overflow: 'hidden' },
  scriptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#30363d' },
  scriptLabel: { color: '#8B949E', fontSize: Theme.font.size.small },
  copyBtn: { backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Theme.radius.sm },
  copyBtnText: { color: Colors.textInverse, fontSize: Theme.font.size.small, fontWeight: Theme.font.weight.semibold },
  scriptScroll: { padding: 16, maxHeight: 120 },
  scriptText: { color: '#79C0FF', fontSize: 11, fontFamily: 'monospace', lineHeight: 18 },
});
