// FILE: src/components/BuildingUnlockPanel.jsx
// Simple UI panel for unlocking buildings in-game

import React, { useState, useEffect } from 'react';
import { getBalance } from '../modules/wallet';
import { has } from '../modules/buildInventory';

const BUILDINGS = [
  {
    id: 'apb',
    name: 'APB Station',
    cost: 0,
    description: 'Spawn cop chases for bonus coins',
    icon: '🚓',
    free: true,
  },
  {
    id: 'paintshop',
    name: 'Paint Shop',
    cost: 5000,
    description: 'Customize vehicle colors',
    icon: '🎨',
  },
  {
    id: 'garage',
    name: 'Garage',
    cost: 8000,
    description: 'Upgrade vehicle performance',
    icon: '🔧',
  },
  {
    id: 'bank',
    name: 'Investment Bank',
    cost: 50000,
    description: 'Lock coins for premium currency',
    icon: '🏦',
  },
  {
    id: 'house',
    name: 'House (5 pack)',
    cost: 10000,
    description: 'Place houses for income',
    icon: '🏠',
    quantity: 5,
  },
];

export default function BuildingUnlockPanel({ onUnlock, onClose }) {
  const [balance, setBalance] = useState(0);
  const [unlocked, setUnlocked] = useState({});

  useEffect(() => {
    // Initial load
    updateStatus();

    // Listen for wallet changes
    const handleWalletChange = () => updateStatus();
    window.addEventListener('pm_wallet_changed', handleWalletChange);

    // Listen for inventory changes
    const handleInventoryChange = () => updateStatus();
    window.addEventListener('pm_inventory_changed', handleInventoryChange);

    return () => {
      window.removeEventListener('pm_wallet_changed', handleWalletChange);
      window.removeEventListener('pm_inventory_changed', handleInventoryChange);
    };
  }, []);

  const updateStatus = () => {
    setBalance(getBalance());
    const status = {};
    for (const building of BUILDINGS) {
      status[building.id] = has(building.id, 1);
    }
    setUnlocked(status);
  };

  const handleUnlock = async (building) => {
    if (onUnlock) {
      const result = await onUnlock(building.id);
      if (result.success) {
        updateStatus();
      }
    }
  };

  const canAfford = (cost) => balance >= cost;

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(20, 20, 30, 0.95)',
      border: '2px solid #4a9eff',
      borderRadius: '12px',
      padding: '24px',
      minWidth: '400px',
      maxWidth: '600px',
      maxHeight: '80vh',
      overflow: 'auto',
      zIndex: 10000,
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
      }}>
        <h2 style={{ color: '#fff', margin: 0 }}>🏗️ Unlock Buildings</h2>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            fontSize: '24px',
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>

      <div style={{
        background: 'rgba(255, 200, 100, 0.1)',
        padding: '12px',
        borderRadius: '8px',
        marginBottom: '20px',
        color: '#ffc864',
        textAlign: 'center',
        fontSize: '18px',
        fontWeight: 'bold',
      }}>
        💰 Balance: {balance.toLocaleString()} Mate Coins
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {BUILDINGS.map((building) => {
          const isUnlocked = unlocked[building.id];
          const affordable = canAfford(building.cost);
          const canUnlock = !isUnlocked && (affordable || building.free);

          return (
            <div
              key={building.id}
              style={{
                background: isUnlocked 
                  ? 'rgba(100, 200, 100, 0.1)'
                  : 'rgba(255, 255, 255, 0.05)',
                border: isUnlocked 
                  ? '2px solid rgba(100, 200, 100, 0.5)'
                  : '2px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ 
                  fontSize: '24px', 
                  marginBottom: '4px',
                }}>
                  {building.icon} {building.name}
                  {building.quantity && ` (${building.quantity}×)`}
                </div>
                <div style={{ 
                  color: '#aaa', 
                  fontSize: '14px',
                  marginBottom: '8px',
                }}>
                  {building.description}
                </div>
                <div style={{ 
                  color: building.free ? '#4ade80' : '#ffc864',
                  fontSize: '16px',
                  fontWeight: 'bold',
                }}>
                  {building.free ? 'FREE' : `${building.cost.toLocaleString()} MC`}
                </div>
              </div>

              <div>
                {isUnlocked ? (
                  <div style={{
                    background: 'rgba(100, 200, 100, 0.3)',
                    color: '#4ade80',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                  }}>
                    ✓ Unlocked
                  </div>
                ) : (
                  <button
                    onClick={() => handleUnlock(building)}
                    disabled={!canUnlock}
                    style={{
                      background: canUnlock 
                        ? 'linear-gradient(135deg, #4a9eff, #3b82f6)'
                        : 'rgba(100, 100, 100, 0.3)',
                      color: canUnlock ? '#fff' : '#666',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '6px',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      cursor: canUnlock ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (canUnlock) {
                        e.target.style.transform = 'scale(1.05)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = 'scale(1)';
                    }}
                  >
                    {building.free ? 'Claim Free' : 'Unlock'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: '20px',
        padding: '12px',
        background: 'rgba(74, 158, 255, 0.1)',
        borderRadius: '8px',
        color: '#88c0ff',
        fontSize: '13px',
      }}>
        💡 <strong>Tip:</strong> APB Station is free! Unlock it first to start earning bonus coins.
      </div>
    </div>
  );
}