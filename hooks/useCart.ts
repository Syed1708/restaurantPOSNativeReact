// hooks/useCart.ts
import { useMemo, useState } from "react";

export interface CartItem {
  id: number;
  name: string;
  price: number;
  vat_rate: number;
  quantity: number;
}

export const useCart = () => {
  const [cart, setCart] = useState<CartItem[]>([]);

  const addToCart = (product: any) => {
    setCart((currentCart) => {
      const existingIndex = currentCart.findIndex(
        (item) => item.id === product.id,
      );
      if (existingIndex > -1) {
        const newCart = [...currentCart];
        newCart[existingIndex].quantity += 1;
        return newCart;
      }
      return [
        ...currentCart,
        {
          id: product.id,
          name: product.name,
          price: product.price,
          vat_rate: product.vat_rate,
          quantity: 1,
        },
      ];
    });
  };

  const removeFromCart = (productId: number) => {
    setCart((currentCart) => {
      const existingIndex = currentCart.findIndex(
        (item) => item.id === productId,
      );
      if (existingIndex > -1) {
        const newCart = [...currentCart];
        if (newCart[existingIndex].quantity > 1) {
          newCart[existingIndex].quantity -= 1;
          return newCart;
        } else {
          return newCart.filter((item) => item.id !== productId);
        }
      }
      return currentCart;
    });
  };

  const clearCart = () => {
    setCart([]);
  };

  // Calculates HT, TVA, and TTC dynamically
  const totals = useMemo(() => {
    let subtotalExclVat = 0;
    let vatAmount = 0;
    let totalInclVat = 0;

    cart.forEach((item) => {
      const itemTotalTtc = item.price * item.quantity;
      const itemSubtotalHt = itemTotalTtc / (1 + item.vat_rate / 100);
      const itemVat = itemTotalTtc - itemSubtotalHt;

      subtotalExclVat += itemSubtotalHt;
      vatAmount += itemVat;
      totalInclVat += itemTotalTtc;
    });

    return {
      subtotalExclVat,
      vatAmount,
      totalInclVat,
    };
  }, [cart]);

  return {
    cart,
    addToCart,
    removeFromCart,
    clearCart,
    totals,
  };
};
