import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/lib/stores/authStore';
import { crossAlert } from '@/lib/crossAlert';

const SERVICES = ['Tree Removal', 'Tree Trimming', 'Stump Grinding', 'Emergency Storm Response', 'Land Clearing', 'Cabling & Bracing', 'Tree Health Assessment', 'Lot Clearing'];
const RADII = [10, 15, 25, 35, 50, 75];

export default function CompanyInfoStep() {
  const { company, updateCompany, updateOnboardingStep } = useAuthStore();
  const [name, setName] = useState(company?.name ?? '');
  const [phone, setPhone] = useState(company?.phone ?? '');
  const [address, setAddress] = useState(company?.address ?? '');
  const [city, setCity] = useState(company?.city ?? '');
  const [state, setState] = useState(company?.state ?? '');
  const [website, setWebsite] = useState(company?.website ?? '');
  const [radius, setRadius] = useState(company?.service_radius_miles ?? 25);
  const [services, setServices] = useState<string[]>(company?.services_offered ?? []);
  const [loading, setLoading] = useState(false);

  const toggleService = (s: string) =>
    setServices(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const handleNext = async () => {
    if (!name.trim() || !phone.trim() || !city.trim()) {
      crossAlert('Required', 'Please fill in company name, phone, and city.');
      return;
    }
    if (services.length === 0) {
      crossAlert('Required', 'Select at least one service you offer.');
      return;
    }
    setLoading(true);
    const { error } = await updateCompany({
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      website: website.trim(),
      service_radius_miles: radius,
      services_offered: services,
    });
    setLoading(false);
    if (error) { crossAlert('Error', error); return; }
    await updateOnboardingStep(3);
    router.push('/(onboarding)/connect-google');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.progress}>
        {[1,2,3,4,5,6,7,8,9].map(i => (
          <View key={i} style={[styles.dot, i === 2 && styles.dotActive, i < 2 && styles.dotDone]} />
        ))}
      </View>

      <Text style={styles.step}>Step 2 of 9</Text>
      <Text style={styles.title}>Tell us about your company</Text>

      <View style={styles.form}>
        <Input label="Company name *" value={name} onChangeText={setName} placeholder="Acme Tree Service" />
        <Input label="Phone number *" value={phone} onChangeText={setPhone} placeholder="(555) 123-4567" keyboardType="phone-pad" />
        <Input label="Street address" value={address} onChangeText={setAddress} placeholder="123 Main St" />
        <View style={styles.row}>
          <View style={{ flex: 2 }}>
            <Input label="City *" value={city} onChangeText={setCity} placeholder="Houston" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="State" value={state} onChangeText={setState} placeholder="TX" autoCapitalize="characters" />
          </View>
        </View>
        <Input label="Website (optional)" value={website} onChangeText={setWebsite} placeholder="https://smithtrees.com" keyboardType="url" autoCapitalize="none" />
      </View>

      <Text style={styles.sectionTitle}>How far do you travel for jobs?</Text>
      <View style={styles.radiusRow}>
        {RADII.map(r => (
          <TouchableOpacity key={r} style={[styles.radiusChip, radius === r && styles.radiusChipActive]} onPress={() => setRadius(r)}>
            <Text style={[styles.radiusText, radius === r && styles.radiusTextActive]}>{r} mi</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>What services do you offer? *</Text>
      <View style={styles.serviceGrid}>
        {SERVICES.map(s => (
          <TouchableOpacity key={s} style={[styles.serviceChip, services.includes(s) && styles.serviceChipActive]} onPress={() => toggleService(s)}>
            <Text style={[styles.serviceText, services.includes(s) && styles.serviceTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Button label="Next: Connect Google →" onPress={handleNext} loading={loading} size="lg" style={styles.nextBtn} />
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
  form: { gap: 12, backgroundColor: Colors.surface, padding: 16, borderRadius: Theme.radius.xl, ...Theme.shadow.sm },
  row: { flexDirection: 'row', gap: 12 },
  sectionTitle: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: Colors.text, marginTop: 8 },
  radiusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  radiusChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Theme.radius.full, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
  radiusChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryDark + '15' },
  radiusText: { fontSize: Theme.font.size.body, color: Colors.textSecondary },
  radiusTextActive: { color: Colors.primary, fontWeight: Theme.font.weight.semibold },
  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  serviceChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: Theme.radius.full, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
  serviceChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  serviceText: { fontSize: Theme.font.size.small, color: Colors.textSecondary },
  serviceTextActive: { color: Colors.textInverse, fontWeight: Theme.font.weight.medium },
  nextBtn: { marginTop: 8 },
});
