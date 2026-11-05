import { Ionicons } from '@expo/vector-icons';
import { colors, PRODUCT_UNITS, productSchema, radii, spacing } from '@localloop/shared';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { BackRow } from '@/components/BackRow';
import { AppText, Banner, Button, Card, Chip, ErrorState, LoadingState, Screen, TextField } from '@/components/ui';
import { publicImageUrl, useCategories } from '@/features/discovery/api';
import {
  useAddProductImage,
  useArchiveProduct,
  useMyStore,
  useRemoveProductImage,
  useSaveProduct,
  useVendorProducts,
} from '@/features/vendor/api';
import { usePhotoPicker } from '@/features/vendor/usePhotoPicker';
import { errorMessage } from '@/lib/errors';
import { removeFile } from '@/services/upload';

interface VariantDraft {
  key: string;
  id?: string;
  label: string;
  unit: (typeof PRODUCT_UNITS)[number];
  unitQuantity: string;
  price: string;
  salePrice: string;
  stock: string;
  trackInventory: boolean;
}

let draftKey = 0;
const blankVariant = (): VariantDraft => ({
  key: `new-${draftKey++}`,
  label: '',
  unit: 'piece',
  unitQuantity: '1',
  price: '',
  salePrice: '',
  stock: '0',
  trackInventory: true,
});

const MAX_PHOTOS = 5;

export default function ProductEdit() {
  const { t, i18n } = useTranslation();
  const te = i18n.language === 'te';
  const params = useLocalSearchParams<{ id?: string; created?: string }>();
  const store = useMyStore();
  const storeId = store.data?.id ?? '';
  const products = useVendorProducts(store.data?.id);
  const categories = useCategories('product');
  const save = useSaveProduct(storeId);
  const archive = useArchiveProduct(storeId);
  const addImage = useAddProductImage(storeId);
  const removeImage = useRemoveProductImage(storeId);
  const photo = usePhotoPicker();
  const existing = params.id ? products.data?.find((p) => p.id === params.id) : undefined;

  const [name, setName] = useState('');
  const [nameTe, setNameTe] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [available, setAvailable] = useState(true);
  const [variants, setVariants] = useState<VariantDraft[]>([blankVariant()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadedId, setLoadedId] = useState<string | null>(null);

  useEffect(() => {
    if (!existing || loadedId === existing.id) return;
    setName(existing.name);
    setNameTe(existing.name_te);
    setDescription(existing.description);
    setCategoryId(existing.category_id);
    setAvailable(existing.is_available);
    setVariants(
      existing.variants
        .filter((v) => v.is_active)
        .sort((a, b) => Number(b.is_default) - Number(a.is_default))
        .map((v) => ({
          key: v.id,
          id: v.id,
          label: v.label,
          unit: v.unit,
          unitQuantity: String(v.unit_quantity),
          price: String(v.price),
          salePrice: v.sale_price != null ? String(v.sale_price) : '',
          stock: String(v.inventory?.quantity ?? 0),
          trackInventory: v.inventory?.track_inventory ?? true,
        })),
    );
    setLoadedId(existing.id);
  }, [existing, loadedId]);

  if (store.isPending || categories.isPending || (params.id && products.isPending)) return <LoadingState />;
  if (categories.isError) return <ErrorState error={categories.error} onRetry={() => void categories.refetch()} />;
  if (params.id && !existing) return <ErrorState error={new Error('product_not_found')} />;

  const setVariant = (key: string, patch: Partial<VariantDraft>) => setVariants((vs) => vs.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));

  const submit = () => {
    const parsed = productSchema.safeParse({
      name,
      nameTe,
      description,
      categoryId,
      isAvailable: available,
      variants: variants.map((v) => ({
        id: v.id,
        label: v.label,
        unit: v.unit,
        unitQuantity: num(v.unitQuantity),
        price: num(v.price),
        salePrice: v.salePrice.trim() === '' ? null : num(v.salePrice),
        stock: v.trackInventory ? Math.trunc(num(v.stock)) : 0,
        trackInventory: v.trackInventory,
      })),
    });
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === 'variants' ? `variants.${String(issue.path[1])}.${String(issue.path[2] ?? '')}` : String(issue.path[0]);
        e[key] ??= issue.message;
      }
      setErrors(e);
      return;
    }
    setErrors({});
    const d = parsed.data;
    save.mutate(
      {
        productId: existing?.id ?? null,
        product: { name: d.name, nameTe: d.nameTe, description: d.description, categoryId: d.categoryId, isAvailable: d.isAvailable },
        variants: d.variants.map((v) => ({
          id: v.id,
          label: v.label,
          unit: v.unit,
          unitQuantity: v.unitQuantity,
          price: v.price,
          salePrice: v.salePrice,
          stock: v.stock,
          trackInventory: v.trackInventory,
        })),
      },
      {
        onSuccess: (id) => {
          if (existing) router.back();
          // New product: stay to add photos (they're stored under the product's id).
          else router.replace({ pathname: '/vendor/product-edit', params: { id, created: '1' } });
        },
      },
    );
  };

  const images = existing ? [...existing.images].sort((a, b) => a.sort_order - b.sort_order) : [];
  const err = (k: string) => errors[k];

  return (
    <Screen edges={['top', 'bottom']} footer={<Button label={t('vendor.save_product')} loading={save.isPending} onPress={submit} />}>
      <BackRow title={existing ? t('vendor.edit_product') : t('vendor.add_product')} />
      {params.created === '1' && <Banner tone="success" message={t('vendor.product_created')} />}

      {/* Photos (after the first save) */}
      {existing ? (
        <View style={styles.group}>
          <AppText weight="medium">{t('vendor.product_photos')}</AppText>
          <ScrollView horizontal contentContainerStyle={styles.photos} showsHorizontalScrollIndicator={false}>
            {images.map((img) => (
              <View key={img.id} style={styles.photo}>
                <Image source={{ uri: publicImageUrl('product-media', img.storage_path) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('vendor.remove_photo')}
                  hitSlop={8}
                  onPress={() =>
                    removeImage.mutate(img.id, {
                      onSuccess: () => void removeFile('product-media', img.storage_path),
                      onError: (e) => Alert.alert(errorMessage(e)),
                    })
                  }
                  style={styles.removePhoto}
                >
                  <Ionicons name="close" size={18} color={colors.text.onBrand} />
                </Pressable>
              </View>
            ))}
            {images.length < MAX_PHOTOS && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('upload.add_photo')}
                disabled={photo.busy}
                onPress={() =>
                  photo.choose('product-media', `${storeId}/${existing.id}`, async (path) => {
                    await addImage.mutateAsync({ productId: existing.id, path, sortOrder: (images.at(-1)?.sort_order ?? -1) + 1 });
                  }, [1, 1])
                }
                style={[styles.photo, styles.addPhoto]}
              >
                {photo.busy ? <ActivityIndicator color={colors.brand.forest} /> : <Ionicons name="camera-outline" size={28} color={colors.brand.forest} />}
              </Pressable>
            )}
          </ScrollView>
        </View>
      ) : (
        <Banner tone="info" message={t('vendor.photos_after_save')} />
      )}

      <TextField label={t('vendor.product_name')} value={name} onChangeText={setName} error={err('name')} />
      <TextField label={t('vendor.product_name_te')} optional value={nameTe} onChangeText={setNameTe} hint={t('vendor.shop_name_te_hint')} />
      <TextField label={t('vendor.product_description')} optional multiline maxLength={2000} value={description} onChangeText={setDescription} />

      <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t('vendor.product_category')}>
        <AppText weight="medium">{t('vendor.product_category')}</AppText>
        <View style={styles.chips}>
          {categories.data.map((c) => (
            <Chip key={c.id} label={te ? c.name_te : c.name_en} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
          ))}
        </View>
        {err('categoryId') && (
          <AppText variant="small" color={colors.status.danger}>
            {t('validation.required')}
          </AppText>
        )}
      </View>

      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <AppText weight="medium">{t('vendor.show_in_shop')}</AppText>
          <AppText variant="small" color={colors.text.secondary}>
            {t('vendor.show_in_shop_hint')}
          </AppText>
        </View>
        <Switch accessibilityLabel={t('vendor.show_in_shop')} value={available} onValueChange={setAvailable} trackColor={{ true: colors.brand.green, false: colors.surface.borderStrong }} />
      </View>

      {/* Sizes */}
      <AppText variant="title" weight="bold">
        {t('vendor.sizes')}
      </AppText>
      {err('variants') && <Banner tone="danger" message={t(err('variants')!)} />}
      {variants.map((v, i) => {
        const e = (f: string) => err(`variants.${i}.${f}`);
        return (
          <Card key={v.key}>
            <View style={styles.rowBetween}>
              <AppText weight="bold">{i === 0 ? t('vendor.size_default', { n: i + 1 }) : t('vendor.size_n', { n: i + 1 })}</AppText>
              {variants.length > 1 && (
                <Pressable accessibilityRole="button" accessibilityLabel={t('vendor.remove_size', { n: i + 1 })} hitSlop={10} onPress={() => setVariants((vs) => vs.filter((x) => x.key !== v.key))}>
                  <Ionicons name="trash-outline" size={22} color={colors.status.danger} />
                </Pressable>
              )}
            </View>
            <TextField label={t('vendor.size_label')} hint={t('vendor.size_label_hint')} value={v.label} onChangeText={(x) => setVariant(v.key, { label: x })} error={e('label')} maxLength={40} />
            <AppText weight="medium">{t('vendor.unit')}</AppText>
            <View style={styles.chips}>
              {PRODUCT_UNITS.map((u) => (
                <Chip key={u} label={t(`units.${u}`)} selected={v.unit === u} onPress={() => setVariant(v.key, { unit: u })} />
              ))}
            </View>
            <View style={styles.pair}>
              <View style={styles.flex}>
                <TextField label={t('vendor.unit_quantity')} keyboardType="decimal-pad" value={v.unitQuantity} onChangeText={(x) => setVariant(v.key, { unitQuantity: x })} error={e('unitQuantity')} />
              </View>
              <View style={styles.flex}>
                <TextField label={t('vendor.price_mrp')} prefix="₹" keyboardType="decimal-pad" value={v.price} onChangeText={(x) => setVariant(v.key, { price: x })} error={e('price')} />
              </View>
            </View>
            <TextField label={t('vendor.offer_price')} optional prefix="₹" keyboardType="decimal-pad" value={v.salePrice} onChangeText={(x) => setVariant(v.key, { salePrice: x })} error={e('salePrice')} hint={t('vendor.offer_price_hint')} />
            <View style={styles.switchRow}>
              <AppText style={styles.flex}>{t('vendor.track_stock')}</AppText>
              <Switch accessibilityLabel={t('vendor.track_stock')} value={v.trackInventory} onValueChange={(x) => setVariant(v.key, { trackInventory: x })} trackColor={{ true: colors.brand.green, false: colors.surface.borderStrong }} />
            </View>
            {v.trackInventory ? (
              <TextField label={t('vendor.stock')} keyboardType="number-pad" value={v.stock} onChangeText={(x) => setVariant(v.key, { stock: x })} error={e('stock')} />
            ) : (
              <AppText variant="small" color={colors.text.secondary}>
                {t('vendor.untracked_hint')}
              </AppText>
            )}
          </Card>
        );
      })}
      {variants.length < 20 && <Button label={t('vendor.add_size')} variant="ghost" icon="add" compact onPress={() => setVariants((vs) => [...vs, blankVariant()])} />}

      {save.isError && <Banner tone="danger" message={errorMessage(save.error)} />}
      {existing && (
        <Button
          label={t('vendor.delete_product')}
          variant="danger"
          icon="trash-outline"
          loading={archive.isPending}
          onPress={() =>
            Alert.alert(t('vendor.delete_product_confirm'), t('vendor.delete_product_body'), [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('vendor.delete_product'),
                style: 'destructive',
                onPress: () => archive.mutate(existing.id, { onSuccess: () => router.back(), onError: (e) => Alert.alert(errorMessage(e)) }),
              },
            ])
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photos: { gap: spacing.sm },
  photo: { width: 96, height: 96, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surface.sunken },
  addPhoto: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.brand.forest },
  removePhoto: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: colors.surface.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pair: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
});
