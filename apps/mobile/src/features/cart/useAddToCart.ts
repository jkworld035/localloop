import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { errorMessage } from '@/lib/errors';
import { CartConflictError, useSetCartQuantity } from './api';

/**
 * Changes an item's quantity; if the cart holds another shop's items, asks
 * before starting a new cart. Errors surface as a native alert so the user is
 * never left wondering whether the tap worked.
 */
export function useAddToCart() {
  const { t } = useTranslation();
  const setQty = useSetCartQuantity();

  const change = (storeId: string, variantId: string, quantity: number) =>
    setQty.mutate(
      { storeId, variantId, quantity },
      {
        onError: (err) => {
          if (err instanceof CartConflictError) {
            Alert.alert(t('cart.replace_title'), t('cart.replace_body', { store: err.currentStoreName }), [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('cart.replace_confirm'),
                style: 'destructive',
                onPress: () =>
                  setQty.mutate(
                    { storeId, variantId, quantity, replaceCart: true },
                    { onError: (e) => Alert.alert(errorMessage(e)) },
                  ),
              },
            ]);
          } else {
            Alert.alert(errorMessage(err));
          }
        },
      },
    );

  return { change, pendingVariantId: setQty.isPending ? setQty.variables?.variantId : undefined };
}
