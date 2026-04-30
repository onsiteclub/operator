/**
 * Invoice by Services / Products — Accordion Wizard
 *
 * Sequential 4-step accordion: Client → Job Site → Line Items → Review.
 * Each step expands/collapses; only the active step is fully interactive.
 * Ported from onsite-timekeeper. Differences in this operator version:
 *  - No saved-locations dropdown in Step 2 (operator has no location
 *    store). The job site is free-text only — used as a label in the
 *    invoice notes, not a geolocated record.
 *  - No FRAMING_PRESETS preset chips in Step 3 (timekeeper-specific
 *    construction shortcuts). Operators type line items free-form.
 *
 * The created invoice review uses the shared InvoiceSummaryCard in
 * dual read/edit mode — same component that powers the detail modal
 * on the Invoice tab.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { shareInvoice } from '../../lib/invoiceShare';
import { useRouter } from 'expo-router';

import { PressableOpacity } from '../../components/ui/PressableOpacity';
import { formatMoney, getInitials } from '../../lib/format';
import { useInvoiceStore } from '../../stores/invoiceStore';
import { useAuthStore } from '../../stores/authStore';
import { useBusinessProfileStore } from '../../stores/businessProfileStore';
import { useSnackbarStore } from '../../stores/snackbarStore';
import { InvoiceSummaryCard, type InvoiceSummaryChanges } from './InvoiceSummaryCard';
import { ClientEditSheet, type ClientFormData } from './ClientEditSheet';
import { getInvoiceItems } from '../../lib/database/invoices';
import type { ClientDB, InvoiceDB, InvoiceItemDB } from '../../lib/database/core';

// ============================================
// TYPES
// ============================================

type WizardStep = 1 | 2 | 3 | 4;
type NewClientMode = 'idle' | 'typing';

interface LineItem {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

function newLineItem(): LineItem {
  return { id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, description: '', quantity: '', unitPrice: '' };
}

// ============================================
// HELPERS
// ============================================

const AVATAR_STYLES = [
  { bg: '#FFF8E7', text: '#854F0B' },
  { bg: '#E1F5EE', text: '#085041' },
  { bg: '#E6F1FB', text: '#0C447C' },
  { bg: '#FAECE7', text: '#712B13' },
];

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ============================================
// PROGRESS DOTS
// ============================================

function ProgressDots({ activeStep, completedSteps }: { activeStep: WizardStep; completedSteps: Set<number> }) {
  return (
    <View style={s.dotsRow}>
      {[1, 2, 3, 4].map((step) => (
        <View
          key={step}
          style={[
            s.dot,
            (step === activeStep || completedSteps.has(step)) ? s.dotActive : s.dotPending,
          ]}
        />
      ))}
    </View>
  );
}

// ============================================
// CARD WRAPPER
// ============================================

function StepCard({
  step,
  title,
  activeStep,
  completedSteps,
  summary,
  onEdit,
  children,
}: {
  step: WizardStep;
  title: string;
  activeStep: WizardStep;
  completedSteps: Set<number>;
  summary?: React.ReactNode;
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  const isActive = activeStep === step;
  const isCompleted = completedSteps.has(step);
  const isPending = !isActive && !isCompleted;

  return (
    <View
      style={[
        s.card,
        isActive && s.cardActive,
        isPending && s.cardPending,
      ]}
    >
      <PressableOpacity
        style={s.cardHeader}
        onPress={isCompleted ? onEdit : undefined}
        disabled={!isCompleted}
        activeOpacity={0.6}
      >
        <View style={s.cardHeaderLeft}>
          {isCompleted ? (
            <View style={s.stepCircleCompleted}>
              <Ionicons name="checkmark" size={13} color="#FFFFFF" />
            </View>
          ) : (
            <View style={[s.stepCircle, isActive ? s.stepCircleActive : s.stepCirclePending]}>
              <Text style={[s.stepNumber, isActive ? s.stepNumberActive : s.stepNumberPending]}>
                {step}
              </Text>
            </View>
          )}
          {isCompleted && summary ? (
            <View style={s.summaryContent}>{summary}</View>
          ) : (
            <Text style={[s.stepTitle, isPending && s.stepTitlePending]}>{title}</Text>
          )}
        </View>
        {isCompleted && (
          <View style={s.editHitArea}>
            <Ionicons name="create-outline" size={16} color="#9B9889" />
          </View>
        )}
      </PressableOpacity>

      {isActive && (
        <View style={s.cardContent}>
          {children}
        </View>
      )}
    </View>
  );
}

// ============================================
// MAIN WIZARD
// ============================================

export default function ServicesWizard({ onBack }: { onBack: () => void }) {
  const userId = useAuthStore((st) => st.user?.id ?? null);
  const invoiceStore = useInvoiceStore();
  const businessProfile = useBusinessProfileStore((st) => st.profile);
  const showSnackbar = useSnackbarStore((st) => st.show);
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const [activeStep, setActiveStep] = useState<WizardStep>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // STEP 1: CLIENT
  const [selectedClient, setSelectedClient] = useState<{ name: string; id?: string; clientData?: ClientDB } | null>(null);
  const [newClientMode, setNewClientMode] = useState<NewClientMode>('idle');
  const [typedClientName, setTypedClientName] = useState('');
  const [showClientSheet, setShowClientSheet] = useState(false);

  // STEP 2: JOB SITE (free-text)
  const [jobSiteName, setJobSiteName] = useState('');

  // STEP 3: LINE ITEMS
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  // NOTES (in Step 3, used during generation)
  const [notes, setNotes] = useState('');

  // STEP 4: REVIEW
  const [isGenerating, setIsGenerating] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState<InvoiceDB | null>(null);
  const [createdInvoiceItems, setCreatedInvoiceItems] = useState<InvoiceItemDB[]>([]);

  // DERIVED
  const defaultTaxRate = useMemo(() => businessProfile?.tax_rate || 13, [businessProfile]);

  const recentClients = useMemo(() => {
    const clientNames: string[] = [];
    for (const inv of invoiceStore.recentInvoices) {
      if (inv.client_name && !clientNames.includes(inv.client_name)) {
        clientNames.push(inv.client_name);
      }
    }
    return clientNames.map((name) => {
      const client = invoiceStore.clients.find((c) => c.client_name === name);
      return { name, id: client?.id, clientData: client };
    });
  }, [invoiceStore.recentInvoices, invoiceStore.clients]);

  // Auto-select first recent client on mount (race-guarded so a user
  // who has already typed/picked doesn't get clobbered by an async load).
  const didAutoSelectClient = useRef(false);
  useEffect(() => {
    if (!didAutoSelectClient.current && recentClients.length > 0 && !selectedClient) {
      setSelectedClient(recentClients[0]);
      didAutoSelectClient.current = true;
    }
  }, [recentClients, selectedClient]);

  // Auto-add one empty line item when Step 3 opens.
  useEffect(() => {
    if (activeStep === 3 && lineItems.length === 0) {
      setLineItems([newLineItem()]);
    }
  }, [activeStep]); // eslint-disable-line react-hooks/exhaustive-deps

  const subtotal = useMemo(() => {
    return lineItems.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unitPrice) || 0;
      return sum + qty * price;
    }, 0);
  }, [lineItems]);

  const taxRate = defaultTaxRate;

  const validLineItems = useMemo(() => {
    return lineItems.filter((i) => i.description.trim() && (parseFloat(i.unitPrice) || 0) > 0);
  }, [lineItems]);

  const hasValidItems = validLineItems.length > 0;

  // STEP NAVIGATION
  const advanceTo = useCallback((step: WizardStep) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      for (let i = 1; i < step; i++) next.add(i);
      return next;
    });
    setActiveStep(step);
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 200);
  }, []);

  const reopenStep = useCallback((step: WizardStep) => {
    setActiveStep(step);
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.delete(step);
      return next;
    });
    if (step === 1) {
      setNewClientMode('idle');
      setTypedClientName('');
    }
  }, []);

  // STEP 1
  const selectExistingClient = useCallback((client: { name: string; id?: string; clientData?: ClientDB }) => {
    setSelectedClient(client);
    setNewClientMode('idle');
    setTypedClientName('');
    advanceTo(2);
  }, [advanceTo]);

  const handleClientSheetSave = useCallback((data: ClientFormData) => {
    const name = data.name.trim();
    if (!userId || !name) {
      setShowClientSheet(false);
      return;
    }
    const saved = invoiceStore.saveClient({
      userId,
      clientName: name,
      addressStreet: data.addressStreet,
      addressCity: data.addressCity,
      addressProvince: data.addressProvince,
      addressPostalCode: data.addressPostalCode,
      email: data.email || null,
      phone: data.phone || null,
    });
    setSelectedClient({ name, id: saved?.id, clientData: saved || undefined });
    setTypedClientName('');
    setNewClientMode('idle');
    setShowClientSheet(false);
    advanceTo(2);
  }, [userId, invoiceStore, advanceTo]);

  const handleTypeSubmit = useCallback(() => {
    const name = typedClientName.trim();
    if (!name) return;
    setSelectedClient({ name });
    setNewClientMode('idle');
    setTypedClientName('');
    advanceTo(2);
  }, [typedClientName, advanceTo]);

  const handleClientContinue = useCallback(() => {
    if (newClientMode === 'typing' && typedClientName.trim()) {
      const name = typedClientName.trim();
      setSelectedClient({ name });
      setNewClientMode('idle');
      setTypedClientName('');
      advanceTo(2);
    } else if (selectedClient) {
      advanceTo(2);
    }
  }, [selectedClient, newClientMode, typedClientName, advanceTo]);

  const canContinueClient = !!selectedClient || (newClientMode === 'typing' && typedClientName.trim().length > 0);

  // STEP 2
  const handleJobSiteSkip = useCallback(() => {
    setJobSiteName('');
    advanceTo(3);
  }, [advanceTo]);

  const handleJobSiteContinue = useCallback(() => {
    if (!jobSiteName.trim()) return;
    advanceTo(3);
  }, [jobSiteName, advanceTo]);

  // STEP 3
  const addLineItem = useCallback(() => {
    setLineItems((prev) => [...prev, newLineItem()]);
  }, []);

  const removeLineItem = useCallback((id: string) => {
    setLineItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateLineItem = useCallback((id: string, field: keyof LineItem, value: string) => {
    setLineItems((prev) => prev.map((item) => item.id === id ? { ...item, [field]: value } : item));
  }, []);

  // STEP 4 GENERATION
  const doCreateInvoice = useCallback(async (): Promise<InvoiceDB | null> => {
    if (!userId || !selectedClient) return null;

    if (validLineItems.length === 0) {
      Alert.alert('No valid items', 'At least one item needs a description and price.');
      return null;
    }

    try {
      if (selectedClient.name.trim()) {
        invoiceStore.saveClient({
          userId,
          clientName: selectedClient.name.trim(),
          addressStreet: '',
          addressCity: '',
          addressProvince: '',
          addressPostalCode: '',
        });
      }

      // Default due date: today + 30 days.
      const dueD = new Date();
      dueD.setDate(dueD.getDate() + 30);
      const dueDateStr = toDateStr(dueD);

      const invoiceNotes = [
        jobSiteName.trim() ? `Job site: ${jobSiteName.trim()}` : '',
        notes.trim(),
      ].filter(Boolean).join('\n') || undefined;

      const result = await invoiceStore.createProductsInvoice({
        userId,
        clientName: selectedClient.name.trim(),
        clientId: selectedClient.id || null,
        items: validLineItems.map((i) => ({
          description: i.description,
          quantity: parseFloat(i.quantity) || 1,
          unitPrice: parseFloat(i.unitPrice) || 0,
        })),
        taxRate,
        dueDate: dueDateStr,
        notes: invoiceNotes,
      });

      if (result) return result;
      Alert.alert('Error', 'Failed to create invoice.');
      return null;
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create invoice.');
      return null;
    }
  }, [userId, selectedClient, validLineItems, taxRate, jobSiteName, notes, invoiceStore]);

  const handleAdvanceToReview = useCallback(async () => {
    if (!hasValidItems) return;
    setIsGenerating(true);
    try {
      const result = await doCreateInvoice();
      if (result) {
        const items = getInvoiceItems(result.id);
        setCreatedInvoice(result);
        setCreatedInvoiceItems(items);
        advanceTo(4);
      }
    } catch {
      Alert.alert('Error', 'Failed to generate invoice. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }, [hasValidItems, advanceTo, doCreateInvoice]);

  const handleShareInvoice = useCallback(async () => {
    if (createdInvoice?.pdf_uri && userId) {
      await shareInvoice(userId, createdInvoice);
    }
  }, [createdInvoice, userId]);

  // Inline edits in the Step 4 review card persist via invoiceStore.
  const handleSaveFromReview = useCallback(async (changes: InvoiceSummaryChanges) => {
    if (!userId || !createdInvoice) return;

    const newItems = changes.lineItems;
    let subtotalVal = createdInvoice.subtotal;
    if (newItems) subtotalVal = newItems.reduce((sum, i) => sum + i.total, 0);

    const taxRateVal = changes.taxRate ?? createdInvoice.tax_rate;
    const taxAmountVal = Math.round(subtotalVal * (taxRateVal / 100) * 100) / 100;
    const totalVal = Math.round((subtotalVal + taxAmountVal) * 100) / 100;

    const updated = await invoiceStore.updateInvoice(userId, createdInvoice.id, {
      ...(changes.taxRate !== undefined && { taxRate: changes.taxRate }),
      ...(changes.notes !== undefined && { notes: changes.notes || null }),
      ...(changes.dueDate !== undefined && { dueDate: changes.dueDate }),
      subtotal: subtotalVal,
      taxAmount: taxAmountVal,
      total: totalVal,
    }, newItems);

    if (updated) {
      setCreatedInvoice(updated);
      setCreatedInvoiceItems(getInvoiceItems(updated.id));
    }
  }, [userId, createdInvoice, invoiceStore]);

  const handleEditClientFromReview = useCallback(() => {
    if (!createdInvoice) return;
    const id = createdInvoice.id;
    const num = createdInvoice.invoice_number;
    const name = createdInvoice.client_name || '';
    showSnackbar(`Invoice ${num} saved`);
    onBack();
    router.push({
      pathname: '/client-edit',
      params: { invoiceId: id, invoiceNumber: num, clientName: name },
    } as any);
  }, [createdInvoice, onBack, router, showSnackbar]);

  const handleEditFromFromReview = useCallback(() => {
    if (!createdInvoice) return;
    const id = createdInvoice.id;
    const num = createdInvoice.invoice_number;
    showSnackbar(`Invoice ${num} saved`);
    onBack();
    router.push({
      pathname: '/business-profile',
      params: { invoiceId: id, invoiceNumber: num },
    } as any);
  }, [createdInvoice, onBack, router, showSnackbar]);

  const handleBack = useCallback(() => {
    if (createdInvoice) { onBack(); return; }
    const hasData = selectedClient || lineItems.length > 0 || notes.trim() || jobSiteName.trim();
    if (hasData) {
      Alert.alert(
        'Discard invoice?',
        'You have unsaved changes. Are you sure you want to go back?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: onBack },
        ],
      );
    } else {
      onBack();
    }
  }, [selectedClient, lineItems, notes, jobSiteName, onBack, createdInvoice]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#F5F5F0' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={s.header}>
        <PressableOpacity onPress={handleBack} style={s.backBtn} activeOpacity={0.6}>
          <Ionicons name="arrow-back" size={24} color="#2C2C2A" />
        </PressableOpacity>
        <Text style={s.headerTitle}>Services Invoice</Text>
        <ProgressDots activeStep={activeStep} completedSteps={completedSteps} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* STEP 1 — CLIENT */}
        <StepCard
          step={1}
          title="Send to"
          activeStep={activeStep}
          completedSteps={completedSteps}
          onEdit={() => reopenStep(1)}
          summary={
            selectedClient ? (
              <View style={s.summaryRow}>
                <View style={[s.initialsCircleSm, { backgroundColor: AVATAR_STYLES[0].bg }]}>
                  <Text style={[s.initialsTextSm, { color: AVATAR_STYLES[0].text }]}>
                    {getInitials(selectedClient.name)}
                  </Text>
                </View>
                <Text style={s.summaryText}>{selectedClient.name}</Text>
              </View>
            ) : null
          }
        >
          {recentClients.length > 0 && (
            <View style={newClientMode !== 'idle' ? { opacity: 0.55 } : undefined}>
              <Text style={s.sectionLabel}>Recent</Text>
              <View style={s.clientPillsRow}>
                {recentClients.slice(0, 4).map((client) => {
                  const isSelected = selectedClient?.name === client.name;
                  return (
                    <PressableOpacity
                      key={client.name}
                      style={[s.clientPill, isSelected && s.clientPillSelected]}
                      onPress={() => selectExistingClient(client)}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.clientPillText, isSelected && s.clientPillTextSelected]}>
                        {client.name}
                      </Text>
                    </PressableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {newClientMode === 'idle' && (
            <PressableOpacity
              style={s.newClientBtn}
              onPress={() => setNewClientMode('typing')}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={14} color="#9B9889" />
              <Text style={s.newClientBtnText}>New client</Text>
            </PressableOpacity>
          )}

          {newClientMode === 'typing' && (
            <View style={s.typeNameRow}>
              <TextInput
                style={s.typeNameInput}
                placeholder="Send to..."
                placeholderTextColor="#9B9889"
                value={typedClientName}
                onChangeText={setTypedClientName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleTypeSubmit}
              />
              <PressableOpacity
                style={s.typeNameFullForm}
                onPress={() => setShowClientSheet(true)}
                activeOpacity={0.7}
                accessibilityLabel="Open full client form"
              >
                <Ionicons name="person-add-outline" size={20} color="#2C2C2A" />
              </PressableOpacity>
              <PressableOpacity
                style={[s.typeNameSubmit, !typedClientName.trim() && { opacity: 0.3 }]}
                onPress={handleTypeSubmit}
                disabled={!typedClientName.trim()}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </PressableOpacity>
            </View>
          )}

          <PressableOpacity
            style={[s.continueBtn, !canContinueClient && s.continueBtnDisabled]}
            onPress={handleClientContinue}
            disabled={!canContinueClient}
            activeOpacity={0.7}
          >
            <Text style={s.continueBtnText}>Continue</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </PressableOpacity>
        </StepCard>

        {/* STEP 2 — JOB SITE (free text) */}
        <StepCard
          step={2}
          title="Job site"
          activeStep={activeStep}
          completedSteps={completedSteps}
          onEdit={() => reopenStep(2)}
          summary={
            <Text style={s.summaryText}>
              {jobSiteName.trim() || 'No job site'}
            </Text>
          }
        >
          <TextInput
            style={s.jobSiteInput}
            placeholder="Job site / lot address"
            placeholderTextColor="#9B9889"
            value={jobSiteName}
            onChangeText={setJobSiteName}
            returnKeyType="done"
            onSubmitEditing={handleJobSiteContinue}
          />

          <PressableOpacity onPress={handleJobSiteSkip} style={s.skipLink} activeOpacity={0.6}>
            <Text style={s.skipLinkText}>Skip — add later</Text>
          </PressableOpacity>

          <PressableOpacity
            style={[s.continueBtn, !jobSiteName.trim() && s.continueBtnDisabled]}
            onPress={handleJobSiteContinue}
            disabled={!jobSiteName.trim()}
            activeOpacity={0.7}
          >
            <Text style={s.continueBtnText}>Continue</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </PressableOpacity>
        </StepCard>

        {/* STEP 3 — LINE ITEMS */}
        <StepCard
          step={3}
          title="Line items"
          activeStep={activeStep}
          completedSteps={completedSteps}
          onEdit={() => reopenStep(3)}
          summary={
            lineItems.length > 0 ? (
              <Text style={s.summaryText}>
                {lineItems.length} item{lineItems.length !== 1 ? 's' : ''} · {formatMoney(subtotal)}
              </Text>
            ) : null
          }
        >
          {lineItems.map((item, index) => (
            <View key={item.id} style={s.lineItemCard}>
              <View style={s.lineItemCardHeader}>
                <Text style={s.lineItemIndex}>#{index + 1}</Text>
                <PressableOpacity onPress={() => removeLineItem(item.id)} style={s.deleteItemBtn}>
                  <Ionicons name="close" size={18} color="#A32D2D" />
                </PressableOpacity>
              </View>
              <TextInput
                style={s.lineItemDesc}
                placeholder="Description..."
                placeholderTextColor="#9B9889"
                value={item.description}
                onChangeText={(t) => updateLineItem(item.id, 'description', t)}
                multiline
                autoFocus={index === 0 && lineItems.length === 1}
              />
              <View style={s.lineItemNumbers}>
                <View style={{ flex: 1 }}>
                  <Text style={s.lineItemFieldLabel}>Qty</Text>
                  <TextInput
                    style={s.lineItemNumInput}
                    placeholder="0"
                    placeholderTextColor="#9B9889"
                    value={item.quantity}
                    onChangeText={(t) => updateLineItem(item.id, 'quantity', t.replace(/[^0-9.,]/g, ''))}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.lineItemFieldLabel}>Price</Text>
                  <TextInput
                    style={s.lineItemNumInput}
                    placeholder="$0.00"
                    placeholderTextColor="#9B9889"
                    value={item.unitPrice}
                    onChangeText={(t) => updateLineItem(item.id, 'unitPrice', t.replace(/[^0-9.,]/g, ''))}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ alignItems: 'flex-end', justifyContent: 'flex-end', paddingBottom: 6 }}>
                  <Text style={s.lineItemTotal}>
                    {formatMoney((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0))}
                  </Text>
                </View>
              </View>
            </View>
          ))}

          <PressableOpacity style={s.addItemBtn} onPress={addLineItem} activeOpacity={0.7}>
            <Ionicons name="add" size={14} color="#9B9889" />
            <Text style={s.addItemBtnText}>Add item</Text>
          </PressableOpacity>

          {lineItems.length > 0 && (
            <View style={s.runningSubtotal}>
              <Text style={s.runningSubtotalLabel}>Subtotal</Text>
              <Text style={s.runningSubtotalValue}>{formatMoney(subtotal)}</Text>
            </View>
          )}

          <Text style={s.reviewNotesLabel}>NOTES</Text>
          <TextInput
            style={s.reviewNotesInput}
            placeholder="Optional notes..."
            placeholderTextColor="#9B9889"
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          <PressableOpacity
            style={[s.continueBtn, (!hasValidItems || isGenerating) && s.continueBtnDisabled]}
            onPress={handleAdvanceToReview}
            disabled={!hasValidItems || isGenerating}
            activeOpacity={0.7}
          >
            {isGenerating ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Text style={s.continueBtnText}>
                  {hasValidItems ? 'Continue' : 'Add at least one item'}
                </Text>
                {hasValidItems && <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />}
              </>
            )}
          </PressableOpacity>
        </StepCard>

        {/* STEP 4 — REVIEW */}
        <StepCard
          step={4}
          title="Review"
          activeStep={activeStep}
          completedSteps={completedSteps}
          onEdit={() => reopenStep(4)}
          summary={null}
        >
          {createdInvoice && (
            <>
              <InvoiceSummaryCard
                invoiceNumber={createdInvoice.invoice_number}
                createdAt={createdInvoice.created_at}
                clientName={createdInvoice.client_name || ''}
                clientPhone={selectedClient?.clientData?.phone || undefined}
                clientAddress={
                  selectedClient?.clientData
                    ? [
                        selectedClient.clientData.address_street,
                        selectedClient.clientData.address_city,
                        selectedClient.clientData.address_province,
                        selectedClient.clientData.address_postal_code,
                      ].filter(Boolean).join(', ') || undefined
                    : undefined
                }
                clientEmail={selectedClient?.clientData?.email || undefined}
                onEditClient={handleEditClientFromReview}
                fromName={businessProfile?.business_name || undefined}
                fromPhone={businessProfile?.phone || undefined}
                fromAddress={
                  [
                    businessProfile?.address_street,
                    businessProfile?.address_city,
                    businessProfile?.address_province,
                    businessProfile?.address_postal_code,
                  ].filter(Boolean).join(', ') || undefined
                }
                fromEmail={businessProfile?.email || undefined}
                onEditFrom={handleEditFromFromReview}
                jobSite={jobSiteName.trim() || undefined}
                dueDate={
                  createdInvoice.due_date
                    ? new Date(createdInvoice.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : undefined
                }
                dueDateISO={createdInvoice.due_date || undefined}
                lineItems={createdInvoiceItems.map((item) => ({
                  id: item.id,
                  description: item.description,
                  quantity: item.quantity,
                  unitPrice: item.unit_price,
                  total: item.total,
                }))}
                days={[]}
                totalDays={0}
                totalMinutes={0}
                totalLabel="0h"
                rate={0}
                taxRate={createdInvoice.tax_rate}
                taxLabel={createdInvoice.tax_rate === 13 ? 'HST' : createdInvoice.tax_rate === 5 ? 'GST' : 'Tax'}
                notes={createdInvoice.notes || undefined}
                onSave={handleSaveFromReview}
              />

              <PressableOpacity
                style={s.generateBtn}
                onPress={handleShareInvoice}
                activeOpacity={0.7}
              >
                <Ionicons name="share-outline" size={18} color="#FFFFFF" />
                <Text style={s.generateBtnText}>Share invoice</Text>
              </PressableOpacity>

              <PressableOpacity
                style={s.generateShareBtn}
                onPress={onBack}
                activeOpacity={0.7}
              >
                <Text style={s.generateShareBtnText}>Done</Text>
              </PressableOpacity>
            </>
          )}
        </StepCard>

        <View style={{ height: 80 }} />
      </ScrollView>

      <ClientEditSheet
        visible={showClientSheet}
        onClose={() => setShowClientSheet(false)}
        onSave={handleClientSheetSave}
        initialData={{ name: typedClientName }}
        savedClients={invoiceStore.clients}
      />
    </KeyboardAvoidingView>
  );
}

// ============================================
// STYLES
// ============================================

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
  },
  backBtn: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#2C2C2A', flex: 1, marginLeft: 4 },
  dotsRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { backgroundColor: '#D4A017' },
  dotPending: { backgroundColor: '#D3D1C7' },

  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#E5E3DB',
    marginBottom: 8,
    overflow: 'hidden',
  },
  cardActive: { borderWidth: 1.5, borderColor: '#D4A017' },
  cardPending: { opacity: 0.4 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  cardContent: { paddingHorizontal: 16, paddingBottom: 16 },

  stepCircle: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  stepCircleActive: { borderWidth: 2, borderColor: '#D4A017' },
  stepCirclePending: { borderWidth: 1.5, borderColor: '#D3D1C7' },
  stepCircleCompleted: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#D4A017',
    justifyContent: 'center', alignItems: 'center',
  },
  stepNumber: { fontSize: 12, fontWeight: '600' },
  stepNumberActive: { color: '#D4A017' },
  stepNumberPending: { color: '#9B9889' },
  stepTitle: { fontSize: 15, fontWeight: '600', color: '#2C2C2A' },
  stepTitlePending: { color: '#9B9889' },

  editHitArea: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },

  summaryContent: { flex: 1 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryText: { fontSize: 15, fontWeight: '500', color: '#2C2C2A' },

  sectionLabel: { fontSize: 12, fontWeight: '500', color: '#9B9889', marginBottom: 8 },

  initialsCircleSm: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  initialsTextSm: { fontSize: 11, fontWeight: '600' },

  clientPillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  clientPill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#F5F5F0', borderWidth: 1.5, borderColor: '#D3D1C7',
    minHeight: 40, justifyContent: 'center',
  },
  clientPillSelected: { backgroundColor: '#FFF8E7', borderColor: '#D4A017' },
  clientPillText: { fontSize: 13, fontWeight: '500', color: '#2C2C2A' },
  clientPillTextSelected: { color: '#854F0B' },

  newClientBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#D3D1C7', borderStyle: 'dashed', borderRadius: 8,
    paddingVertical: 14, paddingHorizontal: 14, minHeight: 48, marginBottom: 6,
  },
  newClientBtnText: { fontSize: 13, color: '#9B9889' },

  typeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  typeNameInput: {
    flex: 1, backgroundColor: '#F5F5F0', borderRadius: 8,
    paddingVertical: 14, paddingHorizontal: 12, fontSize: 14, color: '#2C2C2A', minHeight: 48,
  },
  typeNameFullForm: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#F5F5F0',
    borderWidth: 1.5, borderColor: '#D3D1C7', justifyContent: 'center', alignItems: 'center',
  },
  typeNameSubmit: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#2C2C2A',
    justifyContent: 'center', alignItems: 'center',
  },

  continueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#2C2C2A', borderRadius: 8,
    paddingVertical: 14, paddingHorizontal: 24, marginTop: 16,
    alignSelf: 'flex-start', minHeight: 48,
  },
  continueBtnDisabled: { backgroundColor: '#CCCCCC' },
  continueBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },

  jobSiteInput: {
    backgroundColor: '#F5F5F0', borderRadius: 8,
    paddingVertical: 14, paddingHorizontal: 12, fontSize: 14, color: '#2C2C2A',
    minHeight: 48, marginBottom: 8,
  },
  skipLink: { alignSelf: 'center', paddingVertical: 8, marginTop: 12, marginBottom: 4 },
  skipLinkText: { fontSize: 13, color: '#9B9889' },

  lineItemCard: { backgroundColor: '#F5F5F0', borderRadius: 10, padding: 14, marginBottom: 10 },
  lineItemCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  lineItemIndex: { fontSize: 12, fontWeight: '500', color: '#9B9889' },
  deleteItemBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  lineItemDesc: {
    backgroundColor: '#FFFFFF', borderRadius: 8,
    paddingVertical: 12, paddingHorizontal: 12, fontSize: 14, color: '#2C2C2A',
    minHeight: 80, textAlignVertical: 'top', marginTop: 8, marginBottom: 10,
  },
  lineItemNumbers: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  lineItemFieldLabel: { fontSize: 11, fontWeight: '500', color: '#9B9889', marginBottom: 4 },
  lineItemNumInput: {
    backgroundColor: '#FFFFFF', borderRadius: 8,
    paddingVertical: 12, paddingHorizontal: 10, fontSize: 15, fontWeight: '500',
    color: '#2C2C2A', textAlign: 'center', minHeight: 48,
  },
  lineItemTotal: { fontSize: 16, fontWeight: '600', color: '#D4A017' },

  addItemBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#D3D1C7', borderStyle: 'dashed', borderRadius: 8,
    paddingVertical: 14, minHeight: 48, marginTop: 4, marginBottom: 12,
  },
  addItemBtnText: { fontSize: 13, color: '#9B9889' },

  runningSubtotal: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, marginBottom: 12,
  },
  runningSubtotalLabel: { fontSize: 14, color: '#9B9889' },
  runningSubtotalValue: { fontSize: 15, fontWeight: '600', color: '#2C2C2A' },

  reviewNotesLabel: {
    fontSize: 11, fontWeight: '500', color: '#9B9889',
    letterSpacing: 0.5, marginTop: 12, marginBottom: 6,
  },
  reviewNotesInput: {
    backgroundColor: '#FFFFFF', borderRadius: 8,
    paddingVertical: 12, paddingHorizontal: 12, fontSize: 14, color: '#2C2C2A',
    minHeight: 60, marginBottom: 4,
  },

  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#D4A017', borderRadius: 10, paddingVertical: 16, minHeight: 48, marginBottom: 8,
  },
  generateBtnText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  generateShareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#2C2C2A', borderRadius: 10, paddingVertical: 16, minHeight: 48,
  },
  generateShareBtnText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
