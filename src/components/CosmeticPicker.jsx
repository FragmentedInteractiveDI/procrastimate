import React from 'react';
import { useAvatar } from './AvatarContext';

export default function CosmeticPicker() {
  const { cosmetics, updateCosmetic } = useAvatar();
  const { skin, hat } = cosmetics;

  return (
    <div className="cosmetic-picker">
      <h3>Choose Skin:</h3>
      <button 
        onClick={() => updateCosmetic('skin', 'defaultSkin')} 
        className={skin === 'defaultSkin' ? 'selected' : ''}
      >Default</button>
      <button 
        onClick={() => updateCosmetic('skin', 'spaceSuit')} 
        className={skin === 'spaceSuit' ? 'selected' : ''}
      >Space Suit</button>

      <h3>Choose Hat:</h3>
      <button 
        onClick={() => updateCosmetic('hat', 'none')} 
        className={hat === 'none' ? 'selected' : ''}
      >No Hat</button>
      <button 
        onClick={() => updateCosmetic('hat', 'baseballCap')} 
        className={hat === 'baseballCap' ? 'selected' : ''}
      >Baseball Cap</button>
      <button 
        onClick={() => updateCosmetic('hat', 'wizardHat')} 
        className={hat === 'wizardHat' ? 'selected' : ''}
      >Wizard Hat</button>
    </div>
  );
}
